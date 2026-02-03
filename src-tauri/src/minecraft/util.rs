use crate::minecraft::models::{
  FeatureFlags, MavenCoordinate, MojangFeatureRule, MojangLibraryArtifact, MojangRule,
};
use crate::minecraft::DEFAULT_LIBRARIES_URL;

pub(crate) fn current_os_name() -> &'static str {
  match std::env::consts::OS {
    "macos" => "osx",
    other => other,
  }
}

pub(crate) fn current_arch_suffix() -> &'static str {
  if std::env::consts::ARCH.contains("64") {
    "64"
  } else {
    "32"
  }
}

pub(crate) fn rules_allow(
  rules: &Option<Vec<MojangRule>>,
  os_name: &str,
  features: &FeatureFlags,
) -> bool {
  let rules = match rules {
    Some(rules) => rules,
    None => return true,
  };
  let mut allowed = false;

  for rule in rules {
    let os_applies = match &rule.os {
      Some(os) => os.name.as_deref() == Some(os_name),
      None => true,
    };
    let features_apply = match &rule.features {
      Some(rule_features) => features_match(rule_features, features),
      None => true,
    };
    if os_applies && features_apply {
      allowed = rule.action == "allow";
    }
  }
  allowed
}

fn features_match(rule: &MojangFeatureRule, features: &FeatureFlags) -> bool {
  if !rule.extra.is_empty() {
    return false;
  }
  if let Some(expected) = rule.is_demo_user {
    if expected != features.is_demo_user {
      return false;
    }
  }
  if let Some(expected) = rule.has_custom_resolution {
    if expected != features.has_custom_resolution {
      return false;
    }
  }
  if let Some(expected) = rule.has_quick_plays_support {
    if expected != features.has_quick_plays_support {
      return false;
    }
  }
  if let Some(expected) = rule.is_quick_play_singleplayer {
    if expected != features.is_quick_play_singleplayer {
      return false;
    }
  }
  if let Some(expected) = rule.is_quick_play_multiplayer {
    if expected != features.is_quick_play_multiplayer {
      return false;
    }
  }
  if let Some(expected) = rule.is_quick_play_realms {
    if expected != features.is_quick_play_realms {
      return false;
    }
  }
  true
}

pub(crate) fn library_allowed(rules: Option<&Vec<MojangRule>>, os_name: &str) -> bool {
  let mut allowed = true;
  let rules = match rules {
    Some(rules) => rules,
    None => return allowed,
  };

  for rule in rules {
    let applies = match &rule.os {
      Some(os) => os.name.as_deref() == Some(os_name),
      None => true,
    };

    if applies {
      allowed = rule.action == "allow";
    }
  }
  allowed
}

pub(crate) fn is_excluded(path: &str, excludes: &[String]) -> bool {
  excludes.iter().any(|exclude| path.starts_with(exclude))
}

pub(crate) fn parse_maven_coordinate(name: &str) -> Result<MavenCoordinate, String> {
  let parts: Vec<&str> = name.split(':').collect();
  if parts.len() < 3 {
    return Err(format!("invalid maven coordinate '{}'", name));
  }
  Ok(MavenCoordinate {
    group: parts[0].to_string(),
    artifact: parts[1].to_string(),
    version: parts[2].to_string(),
    classifier: parts.get(3).map(|item| item.to_string()),
  })
}

pub(crate) fn build_maven_path_url(
  base_url: &str,
  coordinate: &MavenCoordinate,
) -> Result<(String, String), String> {
  let group_path = coordinate.group.replace('.', "/");
  let classifier = coordinate
    .classifier
    .as_ref()
    .map(|value| format!("-{}", value))
    .unwrap_or_default();
  let file_name = format!(
    "{}-{}{}.jar",
    coordinate.artifact, coordinate.version, classifier
  );
  let path = format!(
    "{}/{}/{}/{}",
    group_path, coordinate.artifact, coordinate.version, file_name
  );
  let base = if base_url.ends_with('/') {
    base_url.to_string()
  } else {
    format!("{}/", base_url)
  };
  Ok((path.clone(), format!("{}{}", base, path)))
}

pub(crate) fn resolve_library_artifact(
  artifact: &MojangLibraryArtifact,
  name: &str,
  classifier: Option<&str>,
) -> Option<(String, String)> {
  if let Some(path) = &artifact.path {
    let url = artifact
      .url
      .clone()
      .unwrap_or_else(|| format!("{}{}", DEFAULT_LIBRARIES_URL, path));
    return Some((url, path.clone()));
  }

  if let Ok(mut coordinate) = parse_maven_coordinate(name) {
    if let Some(classifier) = classifier {
      coordinate.classifier = Some(classifier.to_string());
    }
    if let Ok((path, url)) = build_maven_path_url(DEFAULT_LIBRARIES_URL, &coordinate) {
      return Some((url, path));
    }
  }

  None
}

pub(crate) fn classpath_separator() -> &'static str {
  if cfg!(windows) {
    ";"
  } else {
    ":"
  }
}

pub(crate) fn slugify(name: &str) -> String {
  let mut slug = String::new();
  let mut last_dash = false;

  for ch in name.chars() {
    if ch.is_ascii_alphanumeric() {
      slug.push(ch.to_ascii_lowercase());
      last_dash = false;
    } else if ch == ' ' || ch == '-' || ch == '_' {
      if !last_dash {
        slug.push('-');
        last_dash = true;
      }
    }
  }

  let trimmed = slug.trim_matches('-').to_string();
  if trimmed.is_empty() {
    "instance".to_string()
  } else {
    trimmed
  }
}
