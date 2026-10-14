//! 운영체제 미디어 컨트롤 연결 — 맥은 "지금 재생"·미디어 키(MPRemoteCommandCenter),
//! 윈도우는 시스템 미디어 전송 컨트롤(SMTC).
//!
//! souvlaki의 윈도우 구현은 창 핸들에 묶인 WinRT 객체를 들고 있어서, 만들고 고치는 일을
//! 모두 메인 스레드에서만 한다(`thread_local` + `run_on_main_thread`).

use std::cell::RefCell;
use std::time::Duration;

use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
    SeekDirection,
};
use tauri::{AppHandle, WebviewWindow};

use crate::{Command, TrackState};

/// 미디어 키의 "앞으로/뒤로 감기" 한 번에 움직일 시간(초).
const SEEK_STEP_SECS: f64 = 10.0;

thread_local! {
    static CONTROLS: RefCell<Option<MediaControls>> = const { RefCell::new(None) };
}

/// 메인 스레드에서 호출한다.
pub fn init(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    let hwnd = Some(window.hwnd().map_err(|e| e.to_string())?.0 as *mut std::ffi::c_void);
    #[cfg(not(windows))]
    let hwnd = {
        let _ = window;
        None
    };

    let config = PlatformConfig {
        display_name: "YTM Desktop",
        dbus_name: "ytm_desktop",
        hwnd,
    };
    let mut controls = MediaControls::new(config).map_err(|e| format!("{e:?}"))?;
    let handle = app.clone();
    controls
        .attach(move |event| on_event(&handle, event))
        .map_err(|e| format!("{e:?}"))?;
    CONTROLS.with(|cell| *cell.borrow_mut() = Some(controls));
    Ok(())
}

fn on_event(app: &AppHandle, event: MediaControlEvent) {
    match event {
        MediaControlEvent::Play => crate::send_command(app, Command::Play),
        MediaControlEvent::Pause | MediaControlEvent::Stop => {
            crate::send_command(app, Command::Pause)
        }
        MediaControlEvent::Toggle => crate::send_command(app, Command::Toggle),
        MediaControlEvent::Next => crate::send_command(app, Command::Next),
        MediaControlEvent::Previous => crate::send_command(app, Command::Previous),
        MediaControlEvent::Seek(direction) => {
            crate::send_command(app, Command::SeekBy(signed(direction, SEEK_STEP_SECS)))
        }
        MediaControlEvent::SeekBy(direction, amount) => crate::send_command(
            app,
            Command::SeekBy(signed(direction, amount.as_secs_f64())),
        ),
        MediaControlEvent::SetPosition(MediaPosition(position)) => {
            crate::send_command(app, Command::Seek(position.as_secs_f64()))
        }
        MediaControlEvent::Raise => crate::show_main(app),
        MediaControlEvent::Quit => crate::quit(app),
        // 음량은 YouTube Music 화면의 음량 조절을 그대로 쓴다.
        MediaControlEvent::SetVolume(_) | MediaControlEvent::OpenUri(_) => {}
    }
}

fn signed(direction: SeekDirection, secs: f64) -> f64 {
    match direction {
        SeekDirection::Forward => secs,
        SeekDirection::Backward => -secs,
    }
}

/// 이전 상태와 비교해 바뀐 것만 운영체제에 넘긴다. 어느 스레드에서 불러도 된다.
pub fn update(app: &AppHandle, prev: TrackState, next: TrackState) {
    let result = app.run_on_main_thread(move || {
        CONTROLS.with(|cell| {
            if let Some(controls) = cell.borrow_mut().as_mut() {
                apply(controls, &prev, &next);
            }
        });
    });
    if let Err(err) = result {
        eprintln!("[ytm-desktop] 미디어 컨트롤 갱신 예약 실패: {err}");
    }
}

fn apply(controls: &mut MediaControls, prev: &TrackState, next: &TrackState) {
    if next.title.is_empty() {
        if !prev.title.is_empty() {
            log_err(
                "재생 정지 표시",
                controls.set_playback(MediaPlayback::Stopped),
            );
        }
        return;
    }

    if !next.same_track_info(prev) {
        let duration = (next.duration > 0.0).then(|| Duration::from_secs_f64(next.duration));
        let metadata = MediaMetadata {
            title: Some(&next.title),
            // 윈도우는 None이면 앞 곡 값을 그대로 두므로 빈 문자열로 지운다.
            artist: Some(&next.artist),
            album: Some(&next.album),
            cover_url: (!next.artwork.is_empty()).then_some(next.artwork.as_str()),
            duration,
        };
        log_err("곡 정보 표시", controls.set_metadata(metadata));
    }

    let progress = Some(MediaPosition(Duration::from_secs_f64(
        next.position.max(0.0),
    )));
    let playback = if next.playing {
        MediaPlayback::Playing { progress }
    } else {
        MediaPlayback::Paused { progress }
    };
    log_err("재생 상태 표시", controls.set_playback(playback));
}

fn log_err<E: std::fmt::Debug>(what: &str, result: Result<(), E>) {
    if let Err(err) = result {
        eprintln!("[ytm-desktop] {what} 실패: {err:?}");
    }
}
