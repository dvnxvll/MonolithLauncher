use serde::de::DeserializeOwned;
use std::{fs, io, path::Path, thread, time::Duration};

fn build_agent() -> ureq::Agent {
  ureq::AgentBuilder::new()
    .timeout_connect(Duration::from_secs(10))
    .timeout(Duration::from_secs(120))
    .build()
}

pub(crate) fn fetch_json<T: DeserializeOwned>(url: &str) -> Result<T, String> {
  let text = fetch_text(url)?;
  serde_json::from_str(&text).map_err(map_json_error)
}

pub(crate) fn fetch_text(url: &str) -> Result<String, String> {
  let response = request_with_retry("request", || {
    build_agent()
      .get(url)
      .set("User-Agent", "MonolithLauncher")
      .set("Connection", "close")
      .call()
  })?;
  response.into_string().map_err(|err| err.to_string())
}

pub(crate) fn download_to(url: &str, dest: &Path) -> Result<(), String> {
  if dest.exists() {
    return Ok(());
  }
  if let Some(parent) = dest.parent() {
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
  }

  let tmp = dest.with_extension("tmp");
  let _ = fs::remove_file(&tmp);
  let delays = [200_u64, 500, 1000, 2000, 4000];

  for (idx, delay) in delays.iter().enumerate() {
    match download_once(url, &tmp) {
      Ok(()) => {
        fs::rename(&tmp, dest).map_err(|err| err.to_string())?;
        return Ok(());
      }
      Err(err) => {
        let _ = fs::remove_file(&tmp);
        if !should_retry_download(&err) || idx == delays.len() - 1 {
          return Err(format!("download failed for {}: {}", url, err));
        }
        thread::sleep(Duration::from_millis(*delay));
      }
    }
  }

  Err(format!("download failed for {}", url))
}

#[derive(Debug)]
enum DownloadError {
  Http(ureq::Error),
  Io(io::Error),
}

impl std::fmt::Display for DownloadError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      DownloadError::Http(err) => write!(f, "{err}"),
      DownloadError::Io(err) => write!(f, "{err}"),
    }
  }
}

fn download_once(url: &str, dest: &Path) -> Result<(), DownloadError> {
  let response = build_agent()
    .get(url)
    .set("User-Agent", "MonolithLauncher")
    .set("Connection", "close")
    .call()
    .map_err(DownloadError::Http)?;
  let mut reader = response.into_reader();
  let mut file = fs::File::create(dest).map_err(DownloadError::Io)?;
  io::copy(&mut reader, &mut file).map_err(DownloadError::Io)?;
  Ok(())
}

fn should_retry_http(err: &ureq::Error) -> bool {
  match err {
    ureq::Error::Status(code, _) => *code == 429 || *code >= 500,
    ureq::Error::Transport(_) => true,
  }
}

fn should_retry_download(err: &DownloadError) -> bool {
  match err {
    DownloadError::Http(err) => should_retry_http(err),
    DownloadError::Io(_) => false,
  }
}

pub(crate) fn load_json<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
  let data = fs::read_to_string(path).map_err(|err| err.to_string())?;
  serde_json::from_str(&data).map_err(map_json_error)
}

pub(crate) fn map_json_error(error: serde_json::Error) -> String {
  error.to_string()
}

pub(crate) fn request_with_retry<F>(label: &str, mut op: F) -> Result<ureq::Response, String>
where
  F: FnMut() -> Result<ureq::Response, ureq::Error>,
{
  let delays = [200_u64, 500, 1000, 2000, 4000];

  for (idx, delay) in delays.iter().enumerate() {
    match op() {
      Ok(response) => return Ok(response),
      Err(err) => {
        if !should_retry_http(&err) || idx == delays.len() - 1 {
          return Err(format!("{} failed: {}", label, err));
        }
        thread::sleep(Duration::from_millis(*delay));
      }
    }
  }

  Err(format!("{} failed", label))
}
