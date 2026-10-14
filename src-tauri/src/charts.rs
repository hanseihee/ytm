//! 차트 페이지 받아 오기(멜론·지니·벅스·FLO·VIBE·써클차트·빌보드·Apple Music).
//!
//! 화면에서는 교차 출처 제한으로 못 읽어 여기서 받아 오고, 해석은 화면(src/lib/charts)이 한다
//! (iOS 앱도 같은 해석 코드를 쓴다). 아무 주소나 받지 않도록 차트 사이트만 허용한다.

use std::collections::HashMap;
use std::time::Duration;

use serde::Deserialize;

/// 받을 수 있는 곳(src/lib/charts의 주소들)
const ALLOWED_HOSTS: &[&str] = &[
    "www.melon.com",
    "www.genie.co.kr",
    "music.bugs.co.kr",
    "www.music-flo.com",
    "apis.naver.com",
    "circlechart.kr",
    "www.billboard.com",
    "rss.applemarketingtools.com",
];
/// 빌보드 페이지가 약 3MB라 넉넉히 둔다.
const MAX_PAGE_BYTES: u64 = 12 * 1024 * 1024;

#[derive(Debug, Deserialize)]
pub struct ChartRequest {
    url: String,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    body: Option<String>,
}

fn allowed(url: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(url).map_err(|_| "chart_bad_url".to_owned())?;
    let host = parsed.host_str().unwrap_or_default();
    if parsed.scheme() != "https" || !ALLOWED_HOSTS.contains(&host) {
        return Err(format!("chart_not_allowed {host}"));
    }
    Ok(parsed)
}

fn fetch(req: ChartRequest) -> Result<String, String> {
    let url = allowed(&req.url)?;
    let source = url.host_str().unwrap_or_default().split('.').rev().nth(1).unwrap_or("chart").to_owned();
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(25)))
        // 4xx·5xx도 본문을 받아 우리 오류 이름으로 바꾼다.
        .http_status_as_error(false)
        .build()
        .new_agent();
    let mut res = if req.method.as_deref() == Some("POST") {
        let mut r = agent.post(url.as_str());
        for (k, v) in &req.headers {
            r = r.header(k.as_str(), v.as_str());
        }
        r.send(req.body.unwrap_or_default())
    } else {
        let mut r = agent.get(url.as_str());
        for (k, v) in &req.headers {
            r = r.header(k.as_str(), v.as_str());
        }
        r.call()
    }
    .map_err(|e| format!("{source}_network {e}"))?;
    let status = res.status().as_u16();
    if status >= 400 {
        return Err(format!("{source}_http_{status}"));
    }
    res.body_mut()
        .with_config()
        .limit(MAX_PAGE_BYTES)
        .read_to_string()
        .map_err(|e| format!("{source}_read {e}"))
}

#[tauri::command]
pub async fn chart_fetch(req: ChartRequest) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || fetch(req))
        .await
        .map_err(|e| format!("chart_task {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_chart_sites() {
        assert!(allowed("https://www.melon.com/chart/index.htm").is_ok());
        assert!(allowed("http://www.melon.com/chart/index.htm").is_err());
        assert!(allowed("https://example.com/").is_err());
        assert!(allowed("https://www.melon.com.evil.com/").is_err());
    }

    /// 실제로 받아 온다: `cargo test -- --ignored`
    #[test]
    #[ignore]
    fn live_melon_page() {
        let html = fetch(ChartRequest { url: "https://www.melon.com/chart/index.htm".into(), method: None, headers: HashMap::from([("User-Agent".into(), "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15".into())]), body: None }).unwrap();
        assert!(html.matches("data-song-no").count() >= 100);
    }
}
