use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use napi::bindgen_prelude::*;
use serde_json::{json, Value};

#[napi]
pub fn precompute_graph_meta(graph_json: String) -> Result<String> {
  let v: Value = serde_json::from_str(&graph_json)
    .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid graph JSON: {e}")))?;

  let nodes = v.get("nodes").and_then(|x| x.as_array()).cloned().unwrap_or_default();
  let links = v.get("links").and_then(|x| x.as_array()).cloned().unwrap_or_default();

  // inDegree keyed by node id
  use std::collections::HashMap;
  let mut indeg: HashMap<String, u32> = HashMap::new();

  // init all nodes with 0
  for n in &nodes {
    if let Some(id) = n.get("id").and_then(|x| x.as_str()) {
      indeg.insert(id.to_string(), 0);
    }
  }

  // count targets
  for l in &links {
    let target_id_opt = match l.get("target") {
      Some(Value::String(s)) => Some(s.clone()),
      Some(Value::Object(o)) => o.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()),
      _ => None,
    };

    if let Some(tid) = target_id_opt {
      *indeg.entry(tid).or_insert(0) += 1;
    }
  }

  // build new nodes array with inDegree + gitScore default
  let mut max_in_degree: u32 = 0;
  let mut out_nodes: Vec<Value> = Vec::with_capacity(nodes.len());
  let mut search_index: Vec<Value> = Vec::with_capacity(nodes.len());

  for n in nodes {
    let id = n.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let label = n.get("label").and_then(|x| x.as_str()).unwrap_or("").to_string();

    let d = *indeg.get(&id).unwrap_or(&0);
    if d > max_in_degree { max_in_degree = d; }

    // clone node object and inject fields
    let mut n2 = n.clone();
    if let Value::Object(ref mut obj) = n2 {
      obj.insert("inDegree".to_string(), json!(d));
      obj.insert("gitScore".to_string(), json!(0));
    }

    out_nodes.push(n2);

    // lightweight search index
    search_index.push(json!({
      "id": id,
      "labelLower": label.to_lowercase(),
      "pathLower": id.to_lowercase()
    }));
  }

  let out = json!({
    "graph": {
      "nodes": out_nodes,
      "links": links,
      "timestamp": v.get("timestamp").cloned().unwrap_or(json!(0))
    },
    "maxInDegree": max_in_degree,
    "searchIndex": search_index
  });

  serde_json::to_string(&out)
    .map_err(|e| Error::new(Status::GenericFailure, format!("Serialize failed: {e}")))
}


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

