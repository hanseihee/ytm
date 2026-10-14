//! 멜론 TOP 100(실시간 차트) 페이지 받아 오기.
//!
//! 화면에서는 교차 출처 제한으로 못 읽어 여기서 고정 주소 하나만 받아 오고, 해석은 화면(src/lib/melon.ts)이 한다
//! (iOS 앱도 같은 해석 코드를 쓴다). 2026-10-14 확인: Safari 식별 문자열로 200, 약 470KB.

use std::time::Duration;

const URL: &str = "https://www.melon.com/chart/index.htm";
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
/// 차트 페이지는 보통 0.5MB 안팎. 이보다 크면 이상한 응답으로 본다.
const MAX_PAGE_BYTES: u64 = 8 * 1024 * 1024;

fn fetch_page() -> Result<String, String> {
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .user_agent(USER_AGENT)
        .build()
        .new_agent();
    let mut res = agent
        .get(URL)
        .header("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.8")
        .call()
        .map_err(|e| match e {
            ureq::Error::StatusCode(code) => format!("melon_http_{code}"),
            other => format!("melon_network {other}"),
        })?;
    res.body_mut()
        .with_config()
        .limit(MAX_PAGE_BYTES)
        .read_to_string()
        .map_err(|e| format!("melon_read {e}"))
}

#[tauri::command]
pub async fn melon_chart_page() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(fetch_page)
        .await
        .map_err(|e| format!("melon_task {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 실제 멜론에 접속한다: `cargo test -- --ignored`
    #[test]
    #[ignore]
    fn live_top100_page() {
        let html = fetch_page().unwrap();
        assert!(html.matches("data-song-no").count() >= 100);
    }
}
