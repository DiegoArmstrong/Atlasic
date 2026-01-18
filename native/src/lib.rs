use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

fn should_ignore(root: &Path, full_path: &Path, ignore_patterns: &[String]) -> bool {
  // Mirror your TS logic:
  // relativePath = path.relative(root, filePath).toLowerCase()
  // ignorePatterns.some(p => relativePath.includes(p.toLowerCase()))
  let rel = match full_path.strip_prefix(root) {
    Ok(r) => r,
    Err(_) => full_path,
  };

  let rel_lc = rel.to_string_lossy().to_lowercase();
  ignore_patterns
    .iter()
    .any(|p| rel_lc.contains(&p.to_lowercase()))
}

fn ext_with_dot(path: &Path) -> String {
  match path.extension() {
    Some(e) => format!(".{}", e.to_string_lossy().to_lowercase()),
    None => String::new(),
  }
}

#[napi]
pub fn discover_files(
  workspace_root: String,
  ignore_patterns: Vec<String>,
  max_depth: u32,
  supported_extensions: Vec<String>,
) -> Result<Vec<String>> {
  let root = PathBuf::from(&workspace_root);
  let root = root
    .canonicalize()
    .unwrap_or_else(|_| PathBuf::from(&workspace_root));

  let exts_lc: Vec<String> = supported_extensions
    .into_iter()
    .map(|e| e.to_lowercase())
    .collect();

  let mut out: Vec<String> = Vec::new();

  // WalkDir depth: 0 = root itself, 1 = immediate children, etc.
  let walker = WalkDir::new(&root).follow_links(false).max_depth((max_depth + 1) as usize);

  for entry in walker.into_iter().filter_map(|e| e.ok()) {
    let p = entry.path();

    if should_ignore(&root, p, &ignore_patterns) {
      // If it's a directory, pruning here would be ideal, but WalkDir pruning requires
      // handle with filter_entry. For simplicity + speed-to-ship, we just skip entries.
      continue;
    }

    if entry.file_type().is_file() {
      let ext = ext_with_dot(p);
      if exts_lc.contains(&ext) {
        out.push(p.to_string_lossy().to_string());
      }
    }
  }

  Ok(out)
}

