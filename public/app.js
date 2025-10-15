const STORAGE_KEY = "lcdpano-scenes";
const viewerEl = document.getElementById("viewer");
const sceneListEl = document.getElementById("sceneList");
const importButton = document.getElementById("importPanorama");
const importConfigButton = document.getElementById("importConfig");
const addButton = document.getElementById("addScene");
const exportButton = document.getElementById("exportConfig");
const deleteButton = document.getElementById("deleteScene");
const fileInput = document.getElementById("panoramaFile");
const configInput = document.getElementById("configFile");
const zoomControl = document.getElementById("zoomControl");
const sensitivityControl = document.getElementById("sensitivityControl");
const sceneForm = document.getElementById("sceneForm");
const dialog = document.getElementById("sceneDialog");
const dialogTitle = document.getElementById("dialogTitle");
const dialogLocation = document.getElementById("dialogLocation");
const dialogTags = document.getElementById("dialogTags");
const dialogDescription = document.getElementById("dialogDescription");
const dialogConfirm = document.getElementById("dialogConfirm");
const statusMessageEl = document.getElementById("statusMessage");

const emptyMessage = document.createElement("div");
emptyMessage.className = "empty-message";
emptyMessage.innerHTML =
  "Bir panorama seçin veya <strong>Panorama Yükle</strong> butonunu kullanarak yeni bir sahne ekleyin.";
viewerEl.append(emptyMessage);

const ALLOWED_CONTROL_CODES = new Set([9, 10, 13]);

const state = {
  scenes: [],
  currentIndex: null,
  yaw: 0,
  pitch: 0,
  zoom: 100,
  sensitivity: 4,
};

let dragState = null;
let dialogContext = null;
let statusTimeout = null;

function generateSceneId() {
  if (window.crypto?.randomUUID) {
    return `scene-${crypto.randomUUID()}`;
  }
  return `scene-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function showStatus(message, tone = "info") {
  if (!statusMessageEl) return;
  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }

  if (!message) {
    statusMessageEl.textContent = "";
    statusMessageEl.dataset.tone = "info";
    return;
  }

  statusMessageEl.textContent = message;
  statusMessageEl.dataset.tone = tone;
  statusTimeout = setTimeout(() => {
    statusMessageEl.textContent = "";
    statusMessageEl.dataset.tone = "info";
    statusTimeout = null;
  }, 6000);
}

function normalizeScene(raw) {
  if (!raw || typeof raw !== "object") return null;
  const image =
    typeof raw.image === "string" && raw.image.trim()
      ? raw.image.trim()
      : null;
  if (!image) return null;

  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : typeof raw.tags === "string"
    ? parseTags(raw.tags)
    : [];

  const normalized = {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : generateSceneId(),
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : "Adsız Sahne",
    location: typeof raw.location === "string" ? raw.location.trim() : "",
    description:
      typeof raw.description === "string" ? raw.description.trim() : "",
    tags,
    image,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt.trim()
        ? raw.createdAt.trim()
        : new Date().toISOString(),
  };

  if (typeof raw.updatedAt === "string" && raw.updatedAt.trim()) {
    normalized.updatedAt = raw.updatedAt.trim();
  }

  return normalized;
}

function integrateImportedScenes(normalizedScenes) {
  if (!Array.isArray(normalizedScenes) || !normalizedScenes.length) {
    showStatus("İçe aktarılan dosyada sahne bulunamadı.", "error");
    return;
  }

  const previousId =
    state.currentIndex != null ? state.scenes[state.currentIndex]?.id : null;
  const replaceExisting = state.scenes.length
    ? confirm(
        "Var olan sahnelerin üzerine yazmak ister misiniz? Tamam'a basarsanız mevcut sahnelerinizin yerini alır, İptal'e basarsanız yeni sahneler listenin sonuna eklenir."
      )
    : true;

  let nextScenes;
  if (replaceExisting) {
    nextScenes = normalizedScenes.map((scene) => ({ ...scene }));
  } else {
    const existingIds = new Set(state.scenes.map((scene) => scene.id));
    const preserved = state.scenes.map((scene) => ({ ...scene }));
    const appended = normalizedScenes.map((scene) => {
      const copy = { ...scene };
      let candidate = copy.id;
      while (!candidate || existingIds.has(candidate)) {
        candidate = generateSceneId();
      }
      copy.id = candidate;
      existingIds.add(candidate);
      return copy;
    });
    nextScenes = [...preserved, ...appended];
  }

  state.scenes = nextScenes;
  const saved = persistScenes();

  if (!state.scenes.length) {
    state.currentIndex = null;
    renderSceneList();
    updateForm();
    updateViewerStyle();
    showStatus("İçe aktarma sonrasında sahne bulunamadı.", "error");
    return;
  }

  let nextIndex = 0;
  if (replaceExisting) {
    nextIndex = 0;
  } else if (previousId) {
    const preservedIndex = state.scenes.findIndex(
      (scene) => scene.id === previousId
    );
    nextIndex = preservedIndex !== -1
      ? preservedIndex
      : state.scenes.length - normalizedScenes.length;
  } else {
    nextIndex = state.scenes.length - normalizedScenes.length;
  }

  nextIndex = clamp(nextIndex, 0, state.scenes.length - 1);
  selectScene(nextIndex);
  const message = `Toplam ${normalizedScenes.length} sahne içe aktarıldı.`;
  if (saved) {
    showStatus(message, "success");
  } else {
    showStatus(`${message} Ancak veriler yerel depolamaya kaydedilemedi.`, "error");
  }
}

async function loadInitialScenes() {
  const stored = getStoredScenes();
  if (stored?.length) {
    state.scenes = stored;
    return;
  }

  try {
    const response = await fetch("data/panoramas.json");
    if (!response.ok) throw new Error("Dosya bulunamadı");
    const scenes = await response.json();
    state.scenes = scenes;
    persistScenes();
  } catch (error) {
    console.warn("Ön tanımlı sahne yüklenirken sorun oluştu", error);
    state.scenes = [];
    showStatus("Ön tanımlı sahneler yüklenemedi.", "error");
  }
}

function getStoredScenes() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Yerel depolama okunamadı", error);
    showStatus("Yerel depolama okunamadı. Tarayıcı izinlerini kontrol edin.", "error");
    return null;
  }
}

function persistScenes() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scenes));
    return true;
  } catch (error) {
    console.warn("Sahneler kaydedilemedi", error);
    showStatus("Sahneler kaydedilemedi. Tarayıcı depolama kotasını kontrol edin.", "error");
    return false;
  }
}

function renderSceneList() {
  sceneListEl.innerHTML = "";

  if (!state.scenes.length) {
    const emptyItem = document.createElement("div");
    emptyItem.className = "scene-item";
    emptyItem.innerHTML = "<p>Henüz bir sahne eklenmedi.</p>";
    sceneListEl.append(emptyItem);
    return;
  }

  state.scenes.forEach((scene, index) => {
    const item = document.createElement("button");
    item.className = "scene-item";
    item.type = "button";
    item.setAttribute("role", "listitem");
    if (index === state.currentIndex) {
      item.classList.add("active");
    }

    const subtitle = [];
    if (scene.location) subtitle.push(scene.location);
    if (scene.tags?.length) subtitle.push(scene.tags.join(", "));

    item.innerHTML = `
      <h3>${escapeHtml(scene.title || "Adsız Sahne")}</h3>
      ${subtitle.length ? `<p>${escapeHtml(subtitle.join(" • "))}</p>` : ""}
    `;

    item.addEventListener("click", () => selectScene(index));
    sceneListEl.append(item);
  });
}

function escapeHtml(text) {
  return text
    ?.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    ?? "";
}

function selectScene(index) {
  if (index < 0 || index >= state.scenes.length) return;
  state.currentIndex = index;
  const scene = state.scenes[index];
  applyScene(scene);
  updateForm(scene);
  renderSceneList();
}

function applyScene(scene) {
  if (!scene?.image) {
    viewerEl.style.backgroundImage = "none";
    viewerEl.classList.remove("has-image");
    state.yaw = 0;
    state.pitch = 0;
    updateViewerStyle();
    return;
  }

  viewerEl.style.backgroundImage = `url('${scene.image}')`;
  viewerEl.classList.add("has-image");
  state.yaw = 0;
  state.pitch = 0;
  updateViewerStyle();
}

function updateForm(scene) {
  const target = scene ?? { title: "", location: "", tags: [], description: "" };
  sceneForm.elements.title.value = target.title ?? "";
  sceneForm.elements.location.value = target.location ?? "";
  sceneForm.elements.tags.value = target.tags?.join(", ") ?? "";
  sceneForm.elements.description.value = target.description ?? "";
}

function updateViewerStyle() {
  viewerEl.style.setProperty("--yaw", `${state.yaw}px`);
  viewerEl.style.setProperty("--pitch", `${state.pitch}px`);
  viewerEl.style.setProperty("--zoom", `${state.zoom}%`);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseTags(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function openDialog(initial = {}) {
  dialogTitle.value = initial.title ?? "";
  dialogLocation.value = initial.location ?? "";
  dialogTags.value = initial.tags ? initial.tags.join(", ") : "";
  dialogDescription.value = initial.description ?? "";
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}

function createSceneFromDialog() {
  if (!dialogContext?.image) {
    alert("Lütfen önce bir panorama dosyası seçin.");
    return;
  }

  const nextScene = {
    id: generateSceneId(),
    title: dialogTitle.value.trim() || "Adsız Sahne",
    location: dialogLocation.value.trim(),
    description: dialogDescription.value.trim(),
    tags: parseTags(dialogTags.value),
    image: dialogContext.image,
    createdAt: new Date().toISOString(),
  };

  if (dialogContext?.mode === "duplicate" && typeof dialogContext?.index === "number") {
    state.scenes.splice(dialogContext.index + 1, 0, nextScene);
    state.currentIndex = dialogContext.index + 1;
  } else {
    state.scenes.unshift(nextScene);
    state.currentIndex = 0;
  }

  const saved = persistScenes();
  renderSceneList();
  selectScene(state.currentIndex);
  const displayTitle = nextScene.title || "Adsız Sahne";
  if (saved) {
    showStatus(`"${displayTitle}" sahnesi eklendi.`, "success");
  } else {
    showStatus(
      `"${displayTitle}" sahnesi eklendi ancak veriler yerel depolamaya kaydedilemedi.`,
      "error"
    );
  }
}

function removeScene(index) {
  if (index < 0 || index >= state.scenes.length) return null;
  const [removed] = state.scenes.splice(index, 1);
  if (!state.scenes.length) {
    state.currentIndex = null;
    viewerEl.style.backgroundImage = "none";
    viewerEl.classList.remove("has-image");
    updateForm();
    updateViewerStyle();
    const saved = persistScenes();
    renderSceneList();
    return { scene: removed ?? null, saved };
  }

  state.currentIndex = clamp(index, 0, state.scenes.length - 1);
  const saved = persistScenes();
  renderSceneList();
  selectScene(state.currentIndex);
  return { scene: removed ?? null, saved };
}

function setupViewerInteractions() {
  const baseSensitivity = 0.16;

  viewerEl.addEventListener("pointerdown", (event) => {
    viewerEl.setPointerCapture(event.pointerId);
    dragState = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  });

  viewerEl.addEventListener("pointermove", (event) => {
    if (!dragState) return;
    if (event.pointerId !== dragState.pointerId) return;

    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    dragState.x = event.clientX;
    dragState.y = event.clientY;

    const sensitivity = baseSensitivity * state.sensitivity;
    state.yaw -= dx * sensitivity;
    state.pitch = clamp(state.pitch + dy * sensitivity, -160, 160);
    updateViewerStyle();
  });

  const endDrag = (event) => {
    if (dragState && dragState.pointerId === event.pointerId) {
      viewerEl.releasePointerCapture(event.pointerId);
      dragState = null;
    }
  };

  viewerEl.addEventListener("pointerup", endDrag);
  viewerEl.addEventListener("pointercancel", endDrag);

  viewerEl.addEventListener("wheel", (event) => {
    event.preventDefault();
    const delta = Math.sign(event.deltaY);
    state.zoom = clamp(state.zoom - delta * 4, 40, 160);
    zoomControl.value = state.zoom;
    updateViewerStyle();
  });

  viewerEl.addEventListener("keydown", (event) => {
    const step = 12;
    switch (event.key) {
      case "ArrowLeft":
        state.yaw -= step * state.sensitivity;
        updateViewerStyle();
        break;
      case "ArrowRight":
        state.yaw += step * state.sensitivity;
        updateViewerStyle();
        break;
      case "ArrowUp":
        state.pitch = clamp(state.pitch - step, -160, 160);
        updateViewerStyle();
        break;
      case "ArrowDown":
        state.pitch = clamp(state.pitch + step, -160, 160);
        updateViewerStyle();
        break;
      default:
        break;
    }
  });
}

importButton.addEventListener("click", () => fileInput.click());

if (importConfigButton && configInput) {
  importConfigButton.addEventListener("click", () => configInput.click());
}

fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    dialogContext = { image: reader.result, mode: "create" };
    openDialog();
  };
  reader.readAsDataURL(file);
  fileInput.value = "";
});

function containsBinaryControl(text) {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0) {
      return true;
    }
    if (code < 32 && !ALLOWED_CONTROL_CODES.has(code)) {
      return true;
    }
  }
  return false;
}

async function decompressGzip(buffer) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("gzip-unsupported");
  }
  const stream = new Blob([buffer]).stream();
  const decompressed = stream.pipeThrough(new DecompressionStream("gzip"));
  const response = new Response(decompressed);
  return response.text();
}

async function readConfigFile(file) {
  if (!file) {
    throw new Error("no-file");
  }

  const name = file.name?.toLowerCase?.() ?? "";
  if (
    (file.type && file.type.includes("json")) ||
    name.endsWith(".json") ||
    name.endsWith(".txt")
  ) {
    return file.text();
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isZip = bytes.length > 1 && bytes[0] === 0x50 && bytes[1] === 0x4b; // 'PK'
  if (isZip) {
    throw new Error("zip-not-supported");
  }
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (isGzip || name.endsWith(".gz") || (file.type && file.type.includes("gzip"))) {
    try {
      return await decompressGzip(buffer);
    } catch (error) {
      if (error?.message === "gzip-unsupported") {
        throw error;
      }
      throw new Error("invalid-format");
    }
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const text = decoder.decode(buffer);
  if (containsBinaryControl(text)) {
    throw new Error("binary-not-supported");
  }
  return text;
}

if (configInput) {
  configInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    try {
      const text = await readConfigFile(file);
      const parsed = JSON.parse(text);
      const scenes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.scenes)
        ? parsed.scenes
        : null;
      if (!Array.isArray(scenes)) {
        throw new Error("invalid-format");
      }
      const normalized = scenes
        .map((scene) => normalizeScene(scene))
        .filter(Boolean);
      if (!normalized.length) {
        throw new Error("empty-scenes");
      }
      integrateImportedScenes(normalized);
    } catch (error) {
      console.error("Yapılandırma içe aktarılırken hata oluştu", error);
      let message = "Yapılandırma okunamadı. Lütfen JSON dosyasını kontrol edin.";
      if (error.message === "invalid-format") {
        message = "Dosya biçimi desteklenmiyor. Lütfen geçerli bir JSON seçin.";
      } else if (error.message === "empty-scenes") {
        message = "Dosyada geçerli sahne bulunamadı.";
      } else if (error.message === "binary-not-supported") {
        message =
          "İkili dosyalar desteklenmiyor. Lütfen JSON olarak dışa aktardığınız yapılandırmayı seçin.";
      } else if (error.message === "zip-not-supported") {
        message = "ZIP arşivleri desteklenmiyor. Yalnızca .json veya .json.gz (gzip) belirtin.";
      } else if (error.message === "gzip-unsupported") {
        message =
          "Sıkıştırılmış dosya açılamadı. Tarayıcınızı güncelleyin veya dosyayı JSON olarak dışa aktarın.";
      }
      showStatus(message, "error");
    } finally {
      configInput.value = "";
    }
  });
}

addButton.addEventListener("click", () => {
  if (state.currentIndex == null) {
    alert("Yeni bir sahne oluşturmak için önce bir panorama yükleyin.");
    return;
  }
  const current = state.scenes[state.currentIndex];
  dialogContext = {
    image: current.image,
    mode: "duplicate",
    index: state.currentIndex,
  };
  openDialog({
    title: `${current.title || "Adsız Sahne"} (Kopya)`,
    location: current.location,
    tags: current.tags,
    description: current.description,
  });
});

exportButton.addEventListener("click", () => {
  if (!state.scenes.length) {
    showStatus("Dışa aktarılacak sahne bulunmuyor.", "error");
    return;
  }
  const data = JSON.stringify(state.scenes, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lcd-pano-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  showStatus("Yapılandırma dosyası indirildi.", "success");
});

deleteButton.addEventListener("click", () => {
  if (state.currentIndex == null) return;
  const scene = state.scenes[state.currentIndex];
  const confirmed = confirm(`"${scene.title}" sahnesini silmek istediğinize emin misiniz?`);
  if (!confirmed) return;
  const result = removeScene(state.currentIndex);
  if (result?.scene) {
    const displayTitle = result.scene.title || "Adsız Sahne";
    if (result.saved) {
      showStatus(`"${displayTitle}" sahnesi silindi.`, "success");
    } else {
      showStatus(
        `"${displayTitle}" sahnesi silindi ancak değişiklikler yerel depolamaya kaydedilemedi.`,
        "error"
      );
    }
  }
});

sceneForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.currentIndex == null) return;

  const formData = new FormData(sceneForm);
  const scene = state.scenes[state.currentIndex];
  scene.title = formData.get("title").trim() || "Adsız Sahne";
  scene.location = formData.get("location").trim();
  scene.tags = parseTags(formData.get("tags"));
  scene.description = formData.get("description").trim();
  scene.updatedAt = new Date().toISOString();

  const saved = persistScenes();
  renderSceneList();
  if (saved) {
    showStatus("Sahne bilgileri güncellendi.", "success");
  } else {
    showStatus(
      "Sahne güncellendi ancak değişiklikler yerel depolamaya kaydedilemedi.",
      "error"
    );
  }
});

zoomControl.addEventListener("input", (event) => {
  state.zoom = Number(event.target.value);
  updateViewerStyle();
});

sensitivityControl.addEventListener("input", (event) => {
  state.sensitivity = Number(event.target.value);
});

dialog.addEventListener("close", () => {
  if (dialog.returnValue === "default") {
    createSceneFromDialog();
  }
  dialogContext = null;
});

dialogConfirm.addEventListener("click", (event) => {
  if (!dialogTitle.value.trim()) {
    event.preventDefault();
    dialogTitle.reportValidity();
  }
});

(async function bootstrap() {
  setupViewerInteractions();
  await loadInitialScenes();
  renderSceneList();
  if (state.scenes.length) {
    selectScene(0);
  } else {
    updateViewerStyle();
  }
})();
