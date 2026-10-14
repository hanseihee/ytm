//! Spotify 공개 플레이리스트의 곡 목록 읽기.
//!
//! Spotify Web API는 2024-11-27부터 새 앱에 Spotify 편집 플레이리스트(Top 50 등)를 열어 주지 않는다.
//! 대신 웹사이트에 붙여 넣는 공개 임베드 페이지(open.spotify.com/embed/playlist/<id>)가
//! 서버에서 그린 `__NEXT_DATA__` JSON에 곡 목록을 담고 있어 그것을 읽는다(2026-10-14 확인: 50곡 전부).
//! 브라우저 화면에서는 교차 출처 제한으로 못 읽으므로 여기서 가져온다.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const NEXT_DATA_START: &str = r#"<script id="__NEXT_DATA__" type="application/json">"#;
/// 임베드 페이지는 보통 100KB 안팎. 이보다 크면 이상한 응답으로 본다.
const MAX_PAGE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyTrack {
    pub id: String,
    pub title: String,
    /// "아티스트1, 아티스트2"
    pub artists: String,
    pub duration_ms: u64,
    pub explicit: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyPlaylist {
    pub id: String,
    pub name: String,
    pub subtitle: String,
    pub cover: Option<String>,
    pub tracks: Vec<SpotifyTrack>,
}

fn valid_id(id: &str) -> bool {
    id.len() == 22 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

fn fetch_page(id: &str) -> Result<String, String> {
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .user_agent(USER_AGENT)
        .build()
        .new_agent();
    let mut res = agent
        .get(&format!("https://open.spotify.com/embed/playlist/{id}"))
        .header("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.8")
        .call()
        .map_err(|e| match e {
            ureq::Error::StatusCode(404) => "spotify_not_found".to_owned(),
            ureq::Error::StatusCode(code) => format!("spotify_http_{code}"),
            other => format!("spotify_network {other}"),
        })?;
    res.body_mut()
        .with_config()
        .limit(MAX_PAGE_BYTES)
        .read_to_string()
        .map_err(|e| format!("spotify_read {e}"))
}

fn parse_page(id: &str, html: &str) -> Result<SpotifyPlaylist, String> {
    let start = html.find(NEXT_DATA_START).ok_or("spotify_format_changed")? + NEXT_DATA_START.len();
    let end = html[start..].find("</script>").ok_or("spotify_format_changed")? + start;
    let data: Value = serde_json::from_str(&html[start..end]).map_err(|e| format!("spotify_json {e}"))?;
    let entity = &data["props"]["pageProps"]["state"]["data"]["entity"];
    if entity.is_null() {
        return Err("spotify_format_changed".into());
    }
    let text = |v: &Value| v.as_str().unwrap_or_default().to_owned();
    let tracks = entity["trackList"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|t| {
                    let uri = t["uri"].as_str()?;
                    Some(SpotifyTrack {
                        id: uri.rsplit(':').next().unwrap_or(uri).to_owned(),
                        title: text(&t["title"]),
                        artists: text(&t["subtitle"]),
                        duration_ms: t["duration"].as_u64().unwrap_or(0),
                        explicit: t["isExplicit"].as_bool().unwrap_or(false)
                            || t["isNineteenPlus"].as_bool().unwrap_or(false),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let cover = entity["coverArt"]["sources"]
        .as_array()
        .and_then(|s| s.first())
        .and_then(|s| s["url"].as_str())
        .map(str::to_owned);
    Ok(SpotifyPlaylist {
        id: id.to_owned(),
        name: text(&entity["name"]),
        subtitle: text(&entity["subtitle"]),
        cover,
        tracks,
    })
}

#[tauri::command]
pub async fn spotify_playlist(id: String) -> Result<SpotifyPlaylist, String> {
    if !valid_id(&id) {
        return Err("spotify_bad_id".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let html = fetch_page(&id)?;
        parse_page(&id, &html)
    })
    .await
    .map_err(|e| format!("spotify_task {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_ids() {
        assert!(valid_id("37i9dQZEVXbNxXF4SkHj9F"));
        assert!(!valid_id("37i9dQZEVXbNxXF4SkHj9"));
        assert!(!valid_id("../../etc/passwd/aaaaaa"));
        assert!(!valid_id("37i9dQZEVXbNxXF4SkHj9F?x"));
    }

    #[test]
    fn parses_next_data() {
        let html = r#"<html><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"state":{"data":{"entity":{"name":"Top 50 - South Korea","subtitle":"Spotify","coverArt":{"sources":[{"url":"https://x/y.jpg"}]},"trackList":[{"uri":"spotify:track:abc","title":"LOVE ATTACK","subtitle":"RESCENE","duration":181560,"isExplicit":false}]}}}}}}</script></html>"#;
        let p = parse_page("37i9dQZEVXbNxXF4SkHj9F", html).unwrap();
        assert_eq!(p.name, "Top 50 - South Korea");
        assert_eq!(p.tracks.len(), 1);
        assert_eq!(p.tracks[0].id, "abc");
        assert_eq!(p.tracks[0].duration_ms, 181560);
        assert_eq!(p.cover.as_deref(), Some("https://x/y.jpg"));
    }

    /// 실제 Spotify에 접속한다: `cargo test -- --ignored`
    #[test]
    #[ignore]
    fn live_korea_top50() {
        let html = fetch_page("37i9dQZEVXbNxXF4SkHj9F").unwrap();
        let p = parse_page("37i9dQZEVXbNxXF4SkHj9F", &html).unwrap();
        println!("{} — {}곡, 1위 {} / {}", p.name, p.tracks.len(), p.tracks[0].title, p.tracks[0].artists);
        assert!(p.tracks.len() >= 40);
    }
}
