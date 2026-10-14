//! YTMusic — 자체 화면(main 창)으로 YouTube Music을 쓰는 데스크톱 음악 플레이어.
//!
//! - main 창: React 화면(검색·보관함·플레이리스트·가사·대기열·재생 바).
//! - engine 창: 숨은 music.youtube.com. 공식 플레이어가 소리를 내고, `engine.js`가 내부 API 호출과
//!   재생 제어를 대신한다. 로그인할 때와 "웹 화면 열기"를 고를 때만 보인다.
//! - 운영체제 미디어 컨트롤(맥 지금 재생·윈도우 SMTC)·트레이·메뉴는 여기서 붙인다.

mod desktop;
mod engine;
mod eq;
#[cfg(target_os = "macos")]
mod mac_tap;
mod charts;
mod media;
mod spotify;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::utils::config::{BackgroundThrottlingPolicy, Color};
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{
    AppHandle, Emitter, Manager, RunEvent, Theme, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

use engine::Engine;

pub(crate) const MAIN: &str = "main";
pub(crate) const ENGINE: &str = "engine";
const TRAY: &str = "main";
const APP_NAME: &str = "YTMusic";
const HOME_URL: &str = "https://music.youtube.com/";
/// music.youtube.com 첫 화면의 `ytcfg.SIGNIN_URL`에서 가져온 주소 (2026-10-14 관찰).
const SIGNIN_URL: &str = "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26hl%3Dko%26next%3Dhttps%253A%252F%252Fmusic.youtube.com%252F&hl=ko";
const ENGINE_JS: &str = include_str!("engine.js");

/// 맥 WKWebView 기본 식별 문자열에는 "Safari"가 없어 YouTube Music이 지원하지 않는 브라우저로
/// 판단할 수 있다(식별 문자열 HeadlessChrome에서 "지원 중단된 브라우저" 화면을 관찰). 엔진과 맞는 Safari 값을 쓴다.
/// 윈도우 WebView2의 기본값은 일반 Edge 식별 문자열이라 그대로 둔다.
#[cfg(target_os = "macos")]
const USER_AGENT: Option<&str> = Some(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
);
#[cfg(not(target_os = "macos"))]
const USER_AGENT: Option<&str> = None;

/// 윈도우 WebView2는 창마다 다른 실행 인자를 쓸 수 없어(같은 환경 공유) 두 창에 같은 값을 준다.
/// Tauri 기본값에 "사용자 동작 없이 재생 허용"을 더한다(숨은 엔진 창이 소리를 내야 함).
#[cfg(windows)]
const WEBVIEW2_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

/// 페이지가 보낸 글자를 그대로 믿지 않고 이 길이에서 자른다.
const MAX_TEXT_CHARS: usize = 300;
const MAX_ARTWORK_URL: usize = 2048;
/// 트레이 메뉴의 "지금 재생" 줄 최대 글자 수.
const TRAY_TITLE_CHARS: usize = 40;
/// 앱 화면 배경(로딩 중 흰 화면 깜빡임 방지). styles.css의 --night와 같은 값.
pub(crate) const MAIN_BACKGROUND: Color = Color(20, 14, 28, 255);

/// `engine.js`의 `readState()`가 보내는 값 중 운영체제 연결에 필요한 것.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TrackState {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork: String,
    pub duration: f64,
    pub position: f64,
    pub playing: bool,
}

impl TrackState {
    fn sanitized(mut self) -> Self {
        for text in [
            &mut self.video_id,
            &mut self.title,
            &mut self.artist,
            &mut self.album,
        ] {
            if text.chars().count() > MAX_TEXT_CHARS {
                *text = text.chars().take(MAX_TEXT_CHARS).collect();
            }
        }
        if !self.artwork.starts_with("https://") || self.artwork.len() > MAX_ARTWORK_URL {
            self.artwork.clear();
        }
        for secs in [&mut self.duration, &mut self.position] {
            if !secs.is_finite() || *secs < 0.0 {
                *secs = 0.0;
            }
        }
        self
    }

    /// 곡 정보(재생 위치·상태 제외)가 같은지.
    pub(crate) fn same_track_info(&self, other: &Self) -> bool {
        self.video_id == other.video_id
            && self.title == other.title
            && self.artist == other.artist
            && self.album == other.album
            && self.artwork == other.artwork
            && (self.duration - other.duration).abs() < 1.0
    }

    fn label(&self) -> Option<String> {
        match (self.title.is_empty(), self.artist.is_empty()) {
            (true, _) => None,
            (false, true) => Some(self.title.clone()),
            (false, false) => Some(format!("{} – {}", self.title, self.artist)),
        }
    }
}

#[derive(Default)]
pub(crate) struct AppState {
    pub(crate) track: Mutex<TrackState>,
    /// 화면이 보내 준 지금 언어의 메뉴·창 문구(한국어 원문 → 번역). 없으면 한국어 그대로.
    ui_strings: Mutex<std::collections::HashMap<String, String>>,
    tray_items: Mutex<Option<TrayItems>>,
    quitting: AtomicBool,
}

struct TrayItems {
    now_playing: MenuItem<Wry>,
    toggle: MenuItem<Wry>,
}

/// 메뉴·창 문구를 지금 언어로(화면의 src/i18n/rust.ts와 같은 한국어 원문을 열쇠로 쓴다).
pub(crate) fn l(app: &AppHandle, ko: &str) -> String {
    // 번역이 없으면 한국어 원문('재생@메뉴'처럼 뜻을 나눈 꼬리 '@…'는 뗀다)
    lock(&app.state::<AppState>().ui_strings)
        .get(ko)
        .cloned()
        .unwrap_or_else(|| ko.rsplit_once('@').map_or(ko, |(text, _)| text).to_owned())
}

pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub(crate) fn warn<T, E: std::fmt::Display>(what: &str, result: Result<T, E>) {
    if let Err(err) = result {
        eprintln!("[ytm-desktop] {what} 실패: {err}");
    }
}

/// 앱 화면(main)과 미니 플레이어(mini)에 같은 이벤트를 보낸다(열려 있는 창에만).
pub(crate) fn emit_ui<S: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    for label in [MAIN, desktop::MINI] {
        if app.get_webview_window(label).is_some() {
            warn("화면에 알리기", app.emit_to(label, event, payload.clone()));
        }
    }
}

pub(crate) fn emit_to_main<S: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    show_main(app);
    warn("화면에 알리기", app.emit_to(MAIN, event, payload));
}

// ── 재생 상태 → 창 제목·트레이·운영체제 ─────────────────────────────────────

/// 지금 재생 중인지(EQ 탭의 무음 감지·스펙트럼에 쓴다).
#[allow(dead_code)]
pub(crate) fn is_playing(app: &AppHandle) -> bool {
    lock(&app.state::<AppState>().track).playing
}

pub(crate) fn on_track_state(app: &AppHandle, state: TrackState) {
    let next = state.sanitized();
    let prev = std::mem::replace(&mut *lock(&app.state::<AppState>().track), next.clone());
    if prev.label() != next.label() || prev.playing != next.playing {
        update_labels(app, &next);
    }
    if prev.video_id != next.video_id || prev.title != next.title {
        desktop::on_track_changed(app, &prev, &next);
    }
    media::update(app, prev, next);
}

/// 화면이 언어를 정하거나 바꾸면 메뉴·트레이·창 제목 문구를 받아 다시 만든다.
#[tauri::command]
fn set_ui_strings(app: AppHandle, strings: std::collections::HashMap<String, String>) -> Result<(), String> {
    apply_ui_strings(&app, strings)
}

pub(crate) fn apply_ui_strings(app: &AppHandle, strings: std::collections::HashMap<String, String>) -> Result<(), String> {
    // 너무 큰 값은 받지 않는다(메뉴 문구 수십 개면 충분하다).
    if strings.len() > 500 || strings.iter().any(|(k, v)| k.len() > 300 || v.len() > 300) {
        return Err("too_many_strings".into());
    }
    *lock(&app.state::<AppState>().ui_strings) = strings;
    #[cfg(target_os = "macos")]
    app.set_menu(build_app_menu(app).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY) {
        let (menu, items) = tray_menu(app).map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        *lock(&app.state::<AppState>().tray_items) = Some(items);
    }
    let track = lock(&app.state::<AppState>().track).clone();
    update_labels(app, &track);
    desktop::on_language_changed(app);
    Ok(())
}

/// 개발 빌드 시험용: 트레이 메뉴의 곡 이름·재생 단추 글자
#[cfg(debug_assertions)]
pub(crate) fn tray_texts(app: &AppHandle) -> Vec<String> {
    lock(&app.state::<AppState>().tray_items)
        .as_ref()
        .map(|items| vec![items.now_playing.text().unwrap_or_default(), items.toggle.text().unwrap_or_default()])
        .unwrap_or_default()
}

fn update_labels(app: &AppHandle, track: &TrackState) {
    let label = track.label();
    if let Some(window) = app.get_webview_window(MAIN) {
        warn(
            "창 제목 바꾸기",
            window.set_title(label.as_deref().unwrap_or(APP_NAME)),
        );
    }
    if let Some(tray) = app.tray_by_id(TRAY) {
        let tooltip = match &label {
            Some(text) => format!("{} {text}", if track.playing { "▶" } else { "⏸" }),
            None => APP_NAME.to_owned(),
        };
        warn("트레이 설명 바꾸기", tray.set_tooltip(Some(tooltip)));
    }
    if let Some(items) = lock(&app.state::<AppState>().tray_items).as_ref() {
        let now = match &label {
            Some(text) if text.chars().count() > TRAY_TITLE_CHARS => {
                format!("{}…", text.chars().take(TRAY_TITLE_CHARS).collect::<String>())
            }
            Some(text) => text.clone(),
            None => l(app, "재생 중인 곡 없음"),
        };
        warn("트레이 곡 이름 바꾸기", items.now_playing.set_text(now));
        warn(
            "트레이 재생 버튼 바꾸기",
            items
                .toggle
                .set_text(l(app, if track.playing { "일시정지" } else { "재생" })),
        );
    }
}

// ── 앱 → 엔진(재생 제어) ───────────────────────────────────────────────────

pub(crate) enum Command {
    Play,
    Pause,
    Toggle,
    Next,
    Previous,
    /// 절대 위치(초)
    Seek(f64),
    /// 현재 위치에서 더하거나 뺄 시간(초)
    SeekBy(f64),
}

impl Command {
    fn script(&self) -> String {
        let (name, value) = match *self {
            Command::Play => ("play", None),
            Command::Pause => ("pause", None),
            Command::Toggle => ("toggle", None),
            Command::Next => ("next", None),
            Command::Previous => ("previous", None),
            Command::Seek(secs) => ("seek", Some(secs)),
            Command::SeekBy(secs) => ("seekBy", Some(secs)),
        };
        let value = value
            .filter(|v| v.is_finite())
            .map_or_else(|| "undefined".to_owned(), |v| v.to_string());
        format!(
            "try {{ window.__ytmEngine && window.__ytmEngine.control('{name}', {value}); }} catch (e) {{ console.warn('[ytm-engine]', e); }}"
        )
    }
}

/// 미디어 키·트레이·메뉴에서 오는 재생 제어(답을 기다리지 않는다).
pub(crate) fn send_command(app: &AppHandle, command: Command) {
    if let Some(window) = app.get_webview_window(ENGINE) {
        warn("재생 제어", window.eval(command.script()));
    }
}

// ── 창 ─────────────────────────────────────────────────────────────────────

pub(crate) fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        warn("창 최소화 풀기", window.unminimize());
        warn("창 보이기", window.show());
        warn("창 앞으로", window.set_focus());
    }
}

pub(crate) fn quit(app: &AppHandle) {
    app.state::<AppState>().quitting.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn open_external(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https") {
        warn(
            "기본 브라우저로 열기",
            app.opener().open_url(url.as_str(), None::<&str>),
        );
    }
}

/// 엔진 창 안에서 열어도 되는 새 창 주소: YouTube Music과 Google 로그인.
fn engine_opens_in_app(url: &Url) -> bool {
    let host = url.host_str().unwrap_or_default();
    host == "music.youtube.com"
        || host == "accounts.youtube.com"
        || host.starts_with("accounts.google.")
}

/// 앱 화면 자체의 주소(개발 서버·tauri 프로토콜).
pub(crate) fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "ipc" | "about" | "data" | "blob" => true,
        "http" | "https" => matches!(
            url.host_str(),
            Some("localhost") | Some("tauri.localhost") | Some("ipc.localhost")
        ),
        _ => false,
    }
}

fn build_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let nav_handle = app.clone();
    let popup_handle = app.clone();
    let builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title(APP_NAME)
        .inner_size(1280.0, 820.0)
        .min_inner_size(720.0, 560.0)
        .theme(Some(Theme::Dark))
        .background_color(MAIN_BACKGROUND)
        .disable_drag_drop_handler()
        // 앱 화면은 우리가 만든 페이지뿐이라 바깥 주소로의 이동은 기본 브라우저로 넘긴다.
        .on_navigation(move |url| {
            if is_app_url(url) {
                return true;
            }
            open_external(&nav_handle, url);
            false
        })
        .on_new_window(move |url, _features| {
            open_external(&popup_handle, &url);
            NewWindowResponse::Deny
        });
    #[cfg(windows)]
    let builder = builder.additional_browser_args(WEBVIEW2_ARGS);
    builder.build()
}

fn build_engine_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let popup_handle = app.clone();
    let load_handle = app.clone();
    let home = Url::parse(HOME_URL).expect("HOME_URL은 고정된 올바른 주소");
    let mut builder = WebviewWindowBuilder::new(app, ENGINE, WebviewUrl::External(home))
        .title(l(app, "YouTube Music — 로그인·웹 화면"))
        .inner_size(1100.0, 780.0)
        .min_inner_size(820.0, 560.0)
        .visible(false)
        .theme(Some(Theme::Dark))
        .background_color(Color(3, 3, 3, 255))
        .initialization_script(ENGINE_JS)
        // 창이 숨어 있어도 다음 곡 넘김·상태 보고가 늦어지지 않게 한다(맥 14 이상).
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .disable_drag_drop_handler()
        // 맥 웹뷰는 이동 검사를 하위 프레임(광고·보안문자)에도 걸기 때문에 외부 링크는 새 창 요청에서만 처리한다.
        .on_new_window(move |url, _features| {
            if engine_opens_in_app(&url) {
                if let Some(window) = popup_handle.get_webview_window(ENGINE) {
                    warn("엔진 창 이동", window.navigate(url));
                }
            } else {
                open_external(&popup_handle, &url);
            }
            NewWindowResponse::Deny
        })
        .on_page_load(move |_window, payload| {
            if payload.event() == PageLoadEvent::Started {
                // 페이지가 새로 뜨면 엔진 스크립트도 새로 시작한다. 기다리던 요청은 답을 받을 수 없다.
                let engine = load_handle.state::<Engine>();
                engine.mark_navigating();
                engine.fail_pending("engine_navigating");
            }
        });
    if let Some(user_agent) = USER_AGENT {
        builder = builder.user_agent(user_agent);
    }
    #[cfg(windows)]
    let builder = builder.additional_browser_args(WEBVIEW2_ARGS);
    builder.build()
}

fn show_engine_window(app: &AppHandle, url: Option<&str>) {
    let Some(window) = app.get_webview_window(ENGINE) else {
        return;
    };
    // 영상 창으로 쓰던 중이면 웹 화면으로 돌려놓는다.
    desktop::leave_video(app);
    if let Some(url) = url.and_then(|u| Url::parse(u).ok()) {
        warn("엔진 창 이동", window.navigate(url));
    }
    warn("엔진 창 보이기", window.show());
    warn("엔진 창 앞으로", window.set_focus());
}

/// 화면의 "로그인"·"웹 화면 열기".
#[tauri::command]
fn show_engine(app: AppHandle, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "login" => {
            app.state::<Engine>().set_login_in_progress(true);
            show_engine_window(&app, Some(SIGNIN_URL));
        }
        "web" => show_engine_window(&app, None),
        "reload" => {
            if let Some(window) = app.get_webview_window(ENGINE) {
                warn("엔진 창 다시 불러오기", window.navigate(Url::parse(HOME_URL).expect("고정 주소")));
            }
        }
        other => return Err(format!("unknown_mode {other}")),
    }
    Ok(())
}

#[tauri::command]
fn hide_engine(app: AppHandle) {
    app.state::<Engine>().set_login_in_progress(false);
    if let Some(window) = app.get_webview_window(ENGINE) {
        warn("엔진 창 숨기기", window.hide());
    }
}

// ── 트레이·메뉴 ────────────────────────────────────────────────────────────

/// 트레이 메뉴(언어를 바꾸면 다시 만든다)
fn tray_menu(app: &AppHandle) -> tauri::Result<(Menu<Wry>, TrayItems)> {
    let now_playing = MenuItem::with_id(app, "now", l(app, "재생 중인 곡 없음"), false, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", l(app, "재생"), true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &now_playing,
            &PredefinedMenuItem::separator(app)?,
            &toggle,
            &MenuItem::with_id(app, "next", l(app, "다음 곡"), true, None::<&str>)?,
            &MenuItem::with_id(app, "previous", l(app, "이전 곡"), true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "show", l(app, "창 보이기"), true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", l(app, "종료"), true, None::<&str>)?,
        ],
    )?;
    Ok((menu, TrayItems { now_playing, toggle }))
}

fn build_tray(app: &AppHandle) -> tauri::Result<TrayItems> {
    let (menu, items) = tray_menu(app)?;

    // 맥 메뉴 막대는 검은색 템플릿 아이콘(밝기 모드에 맞춰 자동 반전), 윈도우는 앱 아이콘.
    #[cfg(target_os = "macos")]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    #[cfg(not(target_os = "macos"))]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

    TrayIconBuilder::with_id(TRAY)
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip(APP_NAME)
        .menu(&menu)
        // 맥은 왼쪽 클릭에 메뉴, 윈도우는 왼쪽 클릭에 창을 띄우고 오른쪽 클릭에 메뉴.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_tray_icon_event(|tray, event| {
            if cfg!(target_os = "macos") {
                return;
            }
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(items)
}

/// 맥 메뉴 막대(한국어). 윈도우는 창에 메뉴 막대를 달지 않고 화면 안의 단축키를 쓴다.
#[cfg(target_os = "macos")]
fn build_app_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    use tauri::menu::{AboutMetadata, Submenu};

    let about = AboutMetadata {
        name: Some(APP_NAME.to_owned()),
        version: Some(app.package_info().version.to_string()),
        comments: Some(l(app, "YouTube Music 계정으로 쓰는 데스크톱 음악 플레이어 (비공식)")),
        ..Default::default()
    };
    let app_menu = Submenu::with_items(
        app,
        APP_NAME,
        true,
        &[
            &PredefinedMenuItem::about(app, Some(l(app, "YTMusic에 관하여").as_str()), Some(about))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "ui:settings", l(app, "설정…"), true, Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some(l(app, "서비스").as_str()))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(l(app, "YTMusic 가리기").as_str()))?,
            &PredefinedMenuItem::hide_others(app, Some(l(app, "기타 가리기").as_str()))?,
            &PredefinedMenuItem::show_all(app, Some(l(app, "모두 보기").as_str()))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(l(app, "YTMusic 종료").as_str()))?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        l(app, "편집"),
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(l(app, "실행 취소").as_str()))?,
            &PredefinedMenuItem::redo(app, Some(l(app, "실행 복귀").as_str()))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(l(app, "오려두기").as_str()))?,
            &PredefinedMenuItem::copy(app, Some(l(app, "복사하기").as_str()))?,
            &PredefinedMenuItem::paste(app, Some(l(app, "붙여넣기").as_str()))?,
            &PredefinedMenuItem::select_all(app, Some(l(app, "전체 선택").as_str()))?,
        ],
    )?;
    let playback = Submenu::with_items(
        app,
        l(app, "재생@메뉴"),
        true,
        &[
            &MenuItem::with_id(app, "toggle", l(app, "재생/일시정지"), true, None::<&str>)?,
            &MenuItem::with_id(app, "next", l(app, "다음 곡"), true, None::<&str>)?,
            &MenuItem::with_id(app, "previous", l(app, "이전 곡"), true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "ui:lyrics", l(app, "가사"), true, Some("CmdOrCtrl+L"))?,
            &MenuItem::with_id(app, "ui:lyrics-bigger", l(app, "가사 글자 크게"), true, Some("CmdOrCtrl+="))?,
            &MenuItem::with_id(app, "ui:lyrics-smaller", l(app, "가사 글자 작게"), true, Some("CmdOrCtrl+-"))?,
            &MenuItem::with_id(app, "ui:lyrics-reset", l(app, "가사 글자 기본 크기"), true, Some("CmdOrCtrl+0"))?,
            &MenuItem::with_id(app, "ui:queue", l(app, "대기열"), true, Some("CmdOrCtrl+U"))?,
            &MenuItem::with_id(app, "ui:eq", l(app, "이퀄라이저"), true, Some("CmdOrCtrl+E"))?,
        ],
    )?;
    let go = Submenu::with_items(
        app,
        l(app, "이동"),
        true,
        &[
            &MenuItem::with_id(app, "ui:home", l(app, "홈"), true, Some("CmdOrCtrl+Shift+H"))?,
            &MenuItem::with_id(app, "ui:explore", l(app, "둘러보기"), true, Some("CmdOrCtrl+Shift+E"))?,
            &MenuItem::with_id(app, "ui:stats", l(app, "청취 통계"), true, None::<&str>)?,
            &MenuItem::with_id(app, "ui:search", l(app, "검색"), true, Some("CmdOrCtrl+F"))?,
            &MenuItem::with_id(app, "ui:library", l(app, "보관함"), true, Some("CmdOrCtrl+Shift+L"))?,
            &MenuItem::with_id(app, "ui:spotify", l(app, "차트"), true, Some("CmdOrCtrl+Shift+S"))?,
            &MenuItem::with_id(app, "ui:back", l(app, "뒤로"), true, Some("CmdOrCtrl+["))?,
            &MenuItem::with_id(app, "ui:forward", l(app, "앞으로"), true, Some("CmdOrCtrl+]"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "engine:web", l(app, "YouTube Music 웹 화면 열기"), true, None::<&str>)?,
            &MenuItem::with_id(app, "engine:login", l(app, "Google 계정으로 로그인"), true, None::<&str>)?,
        ],
    )?;
    // 보기 → 테마(화면의 설정과 같은 목록, lib/theme.ts THEMES)
    let themes: Vec<MenuItem<Wry>> = [
        ("system", "시스템 설정"),
        ("dark", "다크"),
        ("light", "라이트"),
        ("midnight", "미드나잇"),
        ("forest", "숲"),
        ("sunset", "노을"),
        ("mono", "모노"),
        ("sakura", "벚꽃"),
        ("album", "앨범 색"),
    ]
    .iter()
    .map(|(id, label)| MenuItem::with_id(app, format!("ui:theme:{id}"), l(app, label), true, None::<&str>))
    .collect::<tauri::Result<_>>()?;
    let theme_refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = themes.iter().map(|m| m as &dyn tauri::menu::IsMenuItem<Wry>).collect();
    let theme_menu = Submenu::with_items(app, l(app, "테마"), true, &theme_refs)?;
    let view = Submenu::with_items(
        app,
        l(app, "보기"),
        true,
        &[
            &theme_menu,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "ui:settings", l(app, "설정 화면"), true, None::<&str>)?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        l(app, "윈도우"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(l(app, "최소화").as_str()))?,
            &PredefinedMenuItem::maximize(app, Some(l(app, "확대/축소").as_str()))?,
            &PredefinedMenuItem::fullscreen(app, Some(l(app, "전체 화면").as_str()))?,
            &PredefinedMenuItem::separator(app)?,
            // 창을 닫으면 숨기기만 한다(on_window_event).
            &PredefinedMenuItem::close_window(app, Some(l(app, "창 닫기").as_str()))?,
        ],
    )?;
    window.set_as_windows_menu_for_nsapp()?;
    Menu::with_items(app, &[&app_menu, &edit, &view, &playback, &go, &window])
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "toggle" => send_command(app, Command::Toggle),
        "next" => send_command(app, Command::Next),
        "previous" => send_command(app, Command::Previous),
        "show" => show_main(app),
        "engine:web" => show_engine_window(app, None),
        "engine:login" => {
            app.state::<Engine>().set_login_in_progress(true);
            show_engine_window(app, Some(SIGNIN_URL));
        }
        "quit" => quit(app),
        // 화면이 처리하는 메뉴(가사·대기열·이동)는 그대로 넘긴다.
        ui if ui.starts_with("ui:") => {
            show_main(app);
            warn(
                "화면에 메뉴 알리기",
                app.emit_to(MAIN, "menu-action", &ui[3..]),
            );
        }
        _ => {}
    }
}

// ── 시작 ───────────────────────────────────────────────────────────────────

/// 개발 빌드 전용 "엔진만" 시험 모드(`YTM_HEADLESS=1`): 화면·트레이·메뉴·미디어 키·EQ 탭 없이 숨은 엔진만 띄운다.
/// 사용자가 쓰는 배포판과 나란히 돌릴 수 있게 하나만 실행·창 위치 기억도 끈다(개발판은 로그인 저장소가 따로다).
fn headless() -> bool {
    cfg!(debug_assertions) && std::env::var_os("YTM_HEADLESS").is_some()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    if !headless() {
        builder = builder
            // 두 번째로 실행하면 새로 띄우지 않고 있던 창을 앞으로 가져온다(반드시 첫 플러그인).
            .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
                show_main(app)
            }))
            // 앱 화면의 크기·위치만 기억한다. 숨김 상태까지 기억하면 다음 실행 때 창이 안 보인다.
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                    .with_denylist(&[ENGINE])
                    .build(),
            );
    }
    let app = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| desktop::on_shortcut(app, shortcut, event.state()))
                .build(),
        )
        .manage(AppState::default())
        .manage(Engine::default())
        .manage(desktop::Extras::default())
        .invoke_handler(tauri::generate_handler![
            set_ui_strings,
            engine::engine_call,
            engine::engine_reply,
            engine::engine_event,
            engine::get_engine_status,
            engine::get_player_state,
            show_engine,
            hide_engine,
            spotify::spotify_playlist,
            charts::chart_fetch,
            desktop::video_window,
            desktop::mini_window,
            desktop::mini_pin,
            desktop::keep_awake,
            desktop::show_main_window,
            desktop::set_prefs,
            engine::ui_log,
            eq::eq_set,
            eq::eq_visualizer,
        ])
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            // 창을 닫아도 음악은 계속 — 숨기기만 하고, 종료는 트레이·메뉴의 "종료"로 한다.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if app.state::<AppState>().quitting.load(Ordering::SeqCst) {
                    return;
                }
                // 미니 플레이어는 그냥 닫는다.
                if window.label() == desktop::MINI {
                    return;
                }
                api.prevent_close();
                if window.label() == ENGINE {
                    app.state::<Engine>().set_login_in_progress(false);
                    if desktop::video_open(app) {
                        desktop::on_engine_close(app);
                        return;
                    }
                }
                warn("창 숨기기", window.hide());
            }
        })
        .setup(|app| {
            let handle = app.handle();
            if headless() {
                build_engine_window(handle)?;
                #[cfg(debug_assertions)]
                engine::spawn_debug_inbox(handle);
                return Ok(());
            }
            #[cfg(target_os = "macos")]
            app.set_menu(build_app_menu(handle)?)?;

            let main = build_main_window(handle)?;
            build_engine_window(handle)?;
            #[cfg(target_os = "macos")]
            mac_tap::init(handle);
            if let Err(err) = media::init(handle, &main) {
                eprintln!("[ytm-desktop] 운영체제 미디어 컨트롤 연결 실패: {err}");
            }
            let items = build_tray(handle)?;
            *lock(&app.state::<AppState>().tray_items) = Some(items);
            #[cfg(debug_assertions)]
            {
                engine::spawn_selftest(handle);
                engine::spawn_debug_inbox(handle);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("YTMusic을 시작하지 못했습니다");

    app.run(|app, event| match event {
        RunEvent::ExitRequested { .. } => {
            app.state::<AppState>().quitting.store(true, Ordering::SeqCst);
        }
        // EQ 탭을 정리해 원래 소리 경로로 돌려놓는다.
        #[cfg(target_os = "macos")]
        RunEvent::Exit => mac_tap::shutdown(),
        // 맥: 창을 숨긴 뒤 Dock 아이콘을 누르면 다시 보여준다.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_main(app),
        _ => {}
    });
}
