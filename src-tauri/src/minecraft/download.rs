use serde::de::DeserializeOwned;
use std::{fs, io, path::Path, thread, time::Duration};
use std::fs::OpenOptions;

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
  let delays = [200_u64, 500, 1000, 2000, 4000];

  for (idx, delay) in delays.iter().enumerate() {
    let resume_from = match fs::metadata(&tmp) {
      Ok(meta) if meta.len() > 0 => Some(meta.len()),
      _ => None,
    };
    match download_once(url, &tmp, resume_from) {
      Ok(()) => {
        fs::rename(&tmp, dest).map_err(|err| err.to_string())?;
        return Ok(());
      }
      Err(err) => {
        if is_range_not_satisfiable(&err) {
          let _ = fs::remove_file(&tmp);
        }
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

fn download_once(url: &str, dest: &Path, resume_from: Option<u64>) -> Result<(), DownloadError> {
  let mut request = build_agent()
    .get(url)
    .set("User-Agent", "MonolithLauncher")
    .set("Connection", "close");
  if let Some(offset) = resume_from {
    request = request.set("Range", &format!("bytes={}-", offset));
  }
  let response = request.call().map_err(DownloadError::Http)?;
  let status = response.status();
  let mut reader = response.into_reader();
  let mut file = if resume_from.unwrap_or(0) > 0 && status == 206 {
    OpenOptions::new().append(true).open(dest).map_err(DownloadError::Io)?
  } else {
    OpenOptions::new()
      .create(true)
      .write(true)
      .truncate(true)
      .open(dest)
      .map_err(DownloadError::Io)?
  };
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

fn is_range_not_satisfiable(err: &DownloadError) -> bool {
  matches!(err, DownloadError::Http(ureq::Error::Status(416, _)))
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
