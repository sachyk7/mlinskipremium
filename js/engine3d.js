import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const ACCENT = 0xff5a1f;
const MODEL_URL = new URL('../assets/models/engine.glb', import.meta.url);
const ROOT_NODE_NAME = 'MLINSKI_ENGINE_ROTATE_THIS_NODE';
const MARKER_NAMES = {
  leistung: 'ANCHOR_LEISTUNG',
  sensorik: 'ANCHOR_SENSORIK',
  systeme: 'ANCHOR_SYSTEME',
};
const PULSE_MATERIAL_NAME = 'Mlinski diagnostic orange';
const GROUP_NAME_RE = /^\d+\s*·/;
const TAU = Math.PI * 2;

// The model groups its geometry into 17 named assemblies (each split further into one
// sub-mesh per material). Those assemblies are the finest meaningful "parts" the model
// offers, so each gets a German name plus a short, real explanation of what it does —
// used by the hover tooltip, the click-to-inspect card and the scroll-driven tour.
const GROUP_INFO = [
  ['Cylinder block and lower casting', 'Zylinderblock und unteres Gehäuse',
    'Das tragende Grundgerüst des Motors. Hier laufen Kolben und Kurbelwelle – die Basis für die gesamte Kraftübertragung.'],
  ['Sump and oil passages', 'Ölwanne und Ölkanäle',
    'Sammelt das Motoröl und leitet es über interne Kanäle zu allen beweglichen Teilen – entscheidend für Schmierung und Kühlung.'],
  ['Left cylinder head', 'Zylinderkopf links',
    'Enthält Ventile und Verbrennungsräume der linken Zylinderbank und steuert Ein- und Auslass des Luft-Kraftstoff-Gemischs.'],
  ['Right cylinder head', 'Zylinderkopf rechts',
    'Das Gegenstück zur linken Seite – identische Aufgabe für die rechte Zylinderbank dieses V-Motors.'],
  ['Intake manifold and throttle', 'Ansaugkrümmer und Drosselklappe',
    'Verteilt die angesaugte Luft gleichmäßig auf alle Zylinder. Die Drosselklappe regelt dabei die Luftmenge – und damit die Leistung.'],
  ['Front timing cover and water pump', 'Steuergehäuse und Wasserpumpe',
    'Schützt den Steuertrieb für die Nockenwellen und beherbergt die Wasserpumpe für den Kühlkreislauf.'],
  ['Serpentine drive and pulleys', 'Riementrieb und Riemenscheiben',
    'Ein einziger Riemen treibt hier Lichtmaschine, Wasserpumpe und weitere Nebenaggregate gleichzeitig an.'],
  ['Alternator with open cooling slots', 'Lichtmaschine mit Kühlschlitzen',
    'Erzeugt den elektrischen Strom für Bordnetz und Batterie, während der Motor läuft. Die Schlitze sorgen für Kühlung.'],
  ['Oil filter housing and sensors', 'Ölfiltergehäuse und Sensorik',
    'Hier wird das Motoröl gefiltert. Sensoren überwachen zugleich Öldruck und -temperatur – wichtige Werte für die Diagnose.'],
  ['Left exhaust and fuel injection', 'Abgaskrümmer und Einspritzung links',
    'Führt die Abgase der linken Zylinderbank ab und dosiert präzise den Kraftstoff für jeden Verbrennungstakt.'],
  ['Right exhaust and fuel injection', 'Abgaskrümmer und Einspritzung rechts',
    'Gleiche Funktion wie links, nur für die rechte Zylinderbank – für gleichmäßige Leistung auf beiden Seiten.'],
  ['Cooling circuit, hoses and clamps', 'Kühlkreislauf, Schläuche und Schellen',
    'Transportiert Kühlmittel durch den Motor, um die Betriebstemperatur konstant zu halten, und schützt so vor Überhitzung.'],
  ['Rear flywheel and starter motor', 'Schwungrad und Anlasser',
    'Das Schwungrad glättet die Kraftimpulse der Kolben, der Anlasser startet den Motor beim Zündschlüssel-Dreh.'],
  ['Wiring harness, clips and ECU connectors', 'Kabelbaum und Steuergeräte-Anschlüsse',
    'Verbindet alle Sensoren und Aktoren mit dem Motorsteuergerät – das Nervensystem des Motors.'],
  ['Mount brackets and diagnostic interfaces', 'Halterungen und Diagnoseschnittstellen',
    'Fixiert den Motor im Fahrzeug und bietet Zugang für unsere Diagnosegeräte bei der Fehlersuche.'],
  ['Cast bosses, vacuum pump and front passages', 'Gussansätze und Unterdruckpumpe',
    'Die Unterdruckpumpe versorgt unter anderem den Bremskraftverstärker – eine kleine Komponente mit großer Sicherheitsfunktion.'],
  ['Engine identification plate', 'Typenschild',
    'Trägt die Motorkennung – wichtig, damit wir bei jeder Reparatur exakt die richtigen Teile verwenden.'],
];
const GROUP_INFO_BY_EN = new Map(GROUP_INFO.map(([en, de, desc]) => [en, { key: en, de, desc }]));
// longest-first, so a shorter name can never shadow a longer one that starts the same way
const GROUP_NAMES_EN = GROUP_INFO.map(([en]) => en).sort((a, b) => b.length - a.length);

function lookupGroup(raw) {
  // Leaf meshes are named "<group> / <material>", but GLTFLoader/Three's node-name
  // sanitizing (for animation-binding paths) strips characters like "/" entirely, so the
  // separator can't be relied on — instead find which known group description the
  // (underscore-un-sanitized) name starts with.
  const cleaned = (raw || '').replace(/_/g, ' ').replace(GROUP_NAME_RE, '').replace(/^\s*·\s*/, '').trim();
  const match = GROUP_NAMES_EN.find((en) => cleaned.startsWith(en));
  return (match && GROUP_INFO_BY_EN.get(match)) || { key: cleaned, de: cleaned, desc: '' };
}

const wrapPi = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const wrap2Pi = (a) => ((a % TAU) + TAU) % TAU;
const smoothstep = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export class Engine3D {
  /**
   * @param {HTMLElement} container
   * @param {Object} opts
   * @param {boolean} opts.reducedMotion
   * @param {Record<'leistung'|'sensorik'|'systeme', HTMLElement>} [opts.leaderEls] - leader
   *   containers whose CSS left/top get driven from the marker's projected screen position
   *   every frame, so the dashed lines track the model as it rotates.
   * @param {(info: {key: string, de: string, desc: string, index: number, total: number}) => void} [opts.onSelect]
   *   called whenever an assembly becomes the active one (click, scroll tour, prev/next, dots).
   * @param {(groups: Array<{key: string, de: string, index: number, total: number}>) => void} [opts.onReady]
   *   called once the model is loaded, with the assemblies in tour order.
   */
  constructor(container, { reducedMotion = false, leaderEls = null, onSelect = null, onReady = null } = {}) {
    this.container = container;
    this.reducedMotion = reducedMotion;
    this.leaderEls = leaderEls;
    this.onSelect = onSelect;
    this.onReady = onReady;

    this.scrollRotation = 0;
    this.dragRotation = 0;
    this.dragVelocity = 0;
    this.dragTarget = null; // set while easing the manual offset toward a focus angle
    this.isDragging = false;
    this.dragMoved = false;
    this.targetScale = 0.92;
    this.currentScale = 0.92;
    this.mouseTarget = { x: 0, y: 0 };
    this.mouseCurrent = { x: 0, y: 0 };
    this.clock = 0;
    this.loaded = false;
    this.loadStarted = false;
    this.active = true;
    this.rootNode = null;
    this.markers = {};

    this.groups = [];     // assemblies, in tour (angular) order
    this.hitTargets = []; // one entry per leaf mesh: { mesh, group, box }
    this.hoveredGroup = null;
    this.selectedGroup = null;
    this._progress = 0;
    this._lastTourStop = -1;

    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2(-99, -99);
    this.hasPointer = false;
    this._edgeCache = new Map();

    this._buildScene();
    this._buildTooltip();
    this._buildLoadingLabel();
    this._bindResize();
    this._bindPointer();
    this._bindLazyLoad();

    if (!reducedMotion) this._tick();
  }

  /* ---------------------------------------------------------------- scene */

  _buildScene() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0c0e);

    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
    this.camera.position.set(4.2, 2.8, 7.2);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);
    this.container.style.cursor = 'grab';
    // vertical swipes keep scrolling the page (no scroll trap on phones); horizontal drags rotate
    this.container.style.touchAction = 'pan-y';

    // studio rig per the model's own lighting notes: neutral key upper-left, weak fill,
    // a white rim from behind, and a restrained warm accent — no bloom, real-workshop feel
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-4, 5, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(3, 1, 4);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.6);
    rim.position.set(1, 3, -5);
    this.scene.add(rim);
    const accentLight = new THREE.PointLight(ACCENT, 6, 10);
    accentLight.position.set(1.5, 0.5, 2.5);
    this.scene.add(accentLight);

    // two outline sets, each traced on the real silhouette of an assembly's meshes:
    // a bright one for whatever is under the pointer, a steadier one for the active part
    this.hoverOutline = this._makeOutline(0.95, 10);
    this.selectedOutline = this._makeOutline(0.7, 9);
  }

  _makeOutline(opacity, renderOrder) {
    const material = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity, depthTest: false });
    const lines = [];
    const edgesFor = (mesh) => {
      let g = this._edgeCache.get(mesh);
      if (!g) {
        // wide threshold: skip fine surface detail, keep the part's real silhouette/creases
        g = new THREE.EdgesGeometry(mesh.geometry, 25);
        this._edgeCache.set(mesh, g);
      }
      return g;
    };
    return {
      show(meshes) {
        this.hide();
        meshes.forEach((mesh, i) => {
          let line = lines[i];
          if (!line) {
            line = new THREE.LineSegments(new THREE.BufferGeometry(), material);
            line.renderOrder = renderOrder;
            line.frustumCulled = false;
            lines[i] = line;
          }
          line.geometry = edgesFor(mesh);
          mesh.add(line);
          line.visible = true;
        });
      },
      hide() {
        lines.forEach((line) => { if (line.parent) line.parent.remove(line); line.visible = false; });
      },
    };
  }

  _buildTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'engine-tooltip';
    this.tooltip.innerHTML = '<span class="engine-tooltip__label">TEIL ERKANNT</span><strong class="engine-tooltip__name"></strong>';
    this.tooltipName = this.tooltip.querySelector('.engine-tooltip__name');
    this.container.appendChild(this.tooltip);
  }

  _buildLoadingLabel() {
    this.loadingLabel = document.createElement('div');
    this.loadingLabel.className = 'engine-loading';
    this.loadingLabel.textContent = 'MODELL WIRD GELADEN …';
    this.container.appendChild(this.loadingLabel);
  }

  /* -------------------------------------------------------------- loading */

  /** start fetching the (large, high-detail) model once the section is roughly a
   *  screen away, so decoding happens while the visitor is still scrolling through
   *  the sections above rather than freezing the page the instant it loads. */
  _bindLazyLoad() {
    this._lazyObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !this.loadStarted) {
        this.loadStarted = true;
        this._loadModel();
      }
      this.active = entry.isIntersecting;
    }, { rootMargin: '40% 0px 40% 0px', threshold: 0 });
    this._lazyObserver.observe(this.container);
  }

  _loadModel() {
    const loader = new GLTFLoader();
    // decode the meshopt-compressed buffers in web workers instead of on the main thread
    if (typeof Worker !== 'undefined') {
      try { MeshoptDecoder.useWorkers(2); } catch { /* falls back to main-thread decoding */ }
    }
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      MODEL_URL.href,
      (gltf) => {
        const root = gltf.scene.getObjectByName(ROOT_NODE_NAME) || gltf.scene;
        root.scale.setScalar(this.currentScale);
        this.scene.add(root);
        this.rootNode = root;
        root.updateMatrixWorld(true);

        // the anchor nodes are empty transforms (no mesh of their own) placed at each
        // sensor location — getWorldPosition works on any Object3D, so that's all
        // the leader-line tracking needs from them
        Object.entries(MARKER_NAMES).forEach(([key, name]) => {
          const obj = root.getObjectByName(name);
          if (obj) this.markers[key] = obj;
        });

        // the visible "sensor" cue is the shared orange material painted onto the real
        // surfaces near each anchor — pulsing it (once) makes every one of those
        // surfaces breathe together, which reads as "live" far better than a lone dot
        this.pulseTargets = [];
        const seenMat = new Set();
        root.traverse((obj) => {
          if (obj.isMesh && obj.material?.name === PULSE_MATERIAL_NAME && !seenMat.has(obj.material)) {
            seenMat.add(obj.material);
            obj.material.emissive = new THREE.Color(ACCENT);
            obj.material.emissiveIntensity = 0.6;
            this.pulseTargets.push(obj.material);
          }
        });

        this._buildGroups(root);

        this.loaded = true;
        this.loadingLabel.classList.add('is-hidden');
        this.onReady?.(this.groups.map((g) => ({ key: g.info.key, de: g.info.de, index: g.order + 1, total: this.groups.length })));
        this.setProgress(this._progress);
        if (this.reducedMotion) this._renderStatic();
      },
      undefined,
      (err) => {
        console.error('Engine3D: failed to load model', err);
        this.loadingLabel.textContent = 'MODELL KONNTE NICHT GELADEN WERDEN';
      },
    );
  }

  /**
   * Hover/inspect targets. The model's ~1.2M vertices are far too dense for per-triangle
   * raycasting on every pointer move, so each leaf mesh gets one bounding box (computed once,
   * here, in the root's local space) and the pointer ray is tested against those ~100 boxes.
   * Leaf meshes are then grouped into the 17 named assemblies, and the assemblies are put in
   * angular order around the engine so the scroll tour sweeps around it in one direction.
   */
  _buildGroups(root) {
    const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const byKey = new Map();
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      box.applyMatrix4(invRoot);
      const info = lookupGroup(obj.name);
      let group = byKey.get(info.key);
      if (!group) {
        group = { info, meshes: [], box: new THREE.Box3() };
        byKey.set(info.key, group);
      }
      group.meshes.push(obj);
      group.box.union(box);
      this.hitTargets.push({ mesh: obj, group, box });
    });

    // rotation (about Y) that turns an assembly's centre towards the camera
    const camAz = Math.atan2(this.camera.position.x, this.camera.position.z);
    const centre = new THREE.Vector3();
    byKey.forEach((group) => {
      group.box.getCenter(centre);
      group.theta = wrap2Pi(camAz - Math.atan2(centre.x, centre.z));
    });
    this.groups = [...byKey.values()].sort((a, b) => a.theta - b.theta);
    this.groups.forEach((g, i) => { g.order = i; });
  }

  /* ------------------------------------------------------------ selection */

  _payload(group) {
    return { key: group.info.key, de: group.info.de, desc: group.info.desc, index: group.order + 1, total: this.groups.length };
  }

  _activate(group, { focus }) {
    this.selectedGroup = group;
    this.selectedOutline.show(group.meshes);
    if (focus) this.focusGroup(group);
    this.onSelect?.(this._payload(group));
    if (this.reducedMotion) this._renderStatic();
  }

  /** make an assembly the active one: outline it, report it, and turn it towards the viewer */
  selectGroup(group, { focus = true } = {}) {
    if (!group) return;
    this._activate(group, { focus });
  }

  selectIndex(i, opts) {
    if (!this.groups.length) return;
    this.selectGroup(this.groups[((i % this.groups.length) + this.groups.length) % this.groups.length], opts);
  }

  /** step through the assemblies (+1 / -1) in tour order — the keyboard/touch-friendly way to browse parts */
  selectRelative(delta) {
    if (!this.groups.length) return;
    const from = this.selectedGroup ? this.selectedGroup.order : (delta > 0 ? -1 : 0);
    this.selectIndex(from + delta);
  }

  /** ease the manual offset so the assembly's centre faces the camera; a no-op if it already does */
  focusGroup(group) {
    const current = this.scrollRotation + this.dragRotation;
    const delta = wrapPi(group.theta - current);
    if (this.reducedMotion) { this.dragRotation += delta; return; }
    if (Math.abs(delta) < 0.35) return;
    this.dragVelocity = 0;
    this.dragTarget = this.dragRotation + delta;
  }

  /** progress: 0..1 across the pinned scroll range — drives the guided tour of the assemblies */
  setProgress(progress) {
    this._progress = progress;
    this.targetScale = 0.92 + Math.min(progress * 1.3, 1) * 0.13;
    const n = this.groups.length;
    if (!n) return;

    const t = Math.min(1, Math.max(0, progress)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(t));
    const f = t - i;
    // each assembly rests facing the camera for the middle of its stretch of scroll,
    // and the engine only turns on the way to the next one
    const k = smoothstep((f - 0.2) / 0.6);
    this.scrollRotation = n > 1
      ? this.groups[i].theta + (this.groups[i + 1].theta - this.groups[i].theta) * k
      : this.groups[0].theta;

    if (progress > 0.004) {
      const stop = Math.round(t);
      if (stop !== this._lastTourStop) {
        this._lastTourStop = stop;
        // let go of any manual spin so the part we're presenting actually faces front
        if (!this.reducedMotion && Math.abs(this.dragRotation) > 0.01) { this.dragVelocity = 0; this.dragTarget = 0; }
        this._activate(this.groups[stop], { focus: false });
      }
    }
    if (this.reducedMotion) this._renderStatic();
  }

  _renderStatic() {
    if (!this.rootNode) return;
    this.rootNode.rotation.y = this.scrollRotation + this.dragRotation;
    this.renderer.render(this.scene, this.camera);
    this._updateMarkerScreenPositions();
  }

  /* ----------------------------------------------------------------- loop */

  _tick = () => {
    if (this.active && this.loaded) {
      this.clock += 0.016;
      const idleY = Math.sin(this.clock * 0.6) * 0.04;
      const idleRot = this.isDragging ? 0 : Math.sin(this.clock * 0.4) * 0.015;

      this.mouseCurrent.x += (this.mouseTarget.x - this.mouseCurrent.x) * 0.06;
      this.mouseCurrent.y += (this.mouseTarget.y - this.mouseCurrent.y) * 0.06;

      if (this.isDragging) {
        this.dragTarget = null;
      } else if (this.dragTarget !== null) {
        // easing towards a focus angle (or back to zero) takes priority over drag inertia
        this.dragRotation += (this.dragTarget - this.dragRotation) * 0.09;
        if (Math.abs(this.dragTarget - this.dragRotation) < 0.002) { this.dragRotation = this.dragTarget; this.dragTarget = null; }
      } else if (Math.abs(this.dragVelocity) > 0.0002) {
        // released drags keep spinning briefly and settle — a "flick" feels tactile
        this.dragRotation += this.dragVelocity;
        this.dragVelocity *= 0.94;
      } else {
        this.dragVelocity = 0;
      }

      this.rootNode.position.y = idleY;
      this.rootNode.rotation.y = this.scrollRotation + this.dragRotation + idleRot + this.mouseCurrent.x;
      this.rootNode.rotation.x = this.mouseCurrent.y;

      this.currentScale += (this.targetScale - this.currentScale) * 0.08;
      this.rootNode.scale.setScalar(this.currentScale);

      if (this.pulseTargets) {
        const pulse = 0.5 + Math.sin(this.clock * 2.2) * 0.35;
        this.pulseTargets.forEach((mat) => { mat.emissiveIntensity = pulse; });
      }

      if (!this.isDragging && this.hasPointer && this.clock - (this._lastHoverCheck || 0) > 0.08) {
        this._lastHoverCheck = this.clock;
        this._updateHover();
      }

      this.renderer.render(this.scene, this.camera);
      this._updateMarkerScreenPositions();
    }
    this._raf = requestAnimationFrame(this._tick);
  };

  /* ---------------------------------------------------------------- hover */

  _updateHover() {
    if (!this.hitTargets.length || !this.rootNode) return;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const invRoot = new THREE.Matrix4().copy(this.rootNode.matrixWorld).invert();
    const localRay = this.raycaster.ray.clone().applyMatrix4(invRoot);

    let closest = null;
    let closestDist = Infinity;
    const hitPoint = new THREE.Vector3();
    this.hitTargets.forEach((target) => {
      if (localRay.intersectBox(target.box, hitPoint)) {
        const d = hitPoint.distanceToSquared(localRay.origin);
        if (d < closestDist) { closestDist = d; closest = target; }
      }
    });
    const group = closest ? closest.group : null;

    if (group !== this.hoveredGroup) {
      this.hoveredGroup = group;
      if (group) {
        this.hoverOutline.show(group.meshes);
        this.tooltipName.textContent = group.info.de;
        this.tooltip.classList.add('is-visible');
        this.container.style.cursor = 'pointer';
      } else {
        this.hoverOutline.hide();
        this.tooltip.classList.remove('is-visible');
        this.container.style.cursor = 'grab';
      }
    }

    if (group) {
      const rect = this.container.getBoundingClientRect();
      this.tooltip.style.left = `${(this.pointerNdc.x * 0.5 + 0.5) * rect.width}px`;
      this.tooltip.style.top = `${(1 - (this.pointerNdc.y * 0.5 + 0.5)) * rect.height}px`;
    }
  }

  _clearHover() {
    this.hoveredGroup = null;
    this.hoverOutline.hide();
    this.tooltip.classList.remove('is-visible');
  }

  _updateMarkerScreenPositions() {
    if (!this.leaderEls) return;
    // leaders are positioned absolute against the pin wrapper (the canvas's parent), not
    // the canvas itself, so project into viewport px first and then re-express against that
    const canvasRect = this.container.getBoundingClientRect();
    const originRect = (this.container.offsetParent || this.container.parentElement).getBoundingClientRect();
    const v = new THREE.Vector3();
    Object.entries(this.markers).forEach(([key, mesh]) => {
      const el = this.leaderEls[key];
      if (!el) return;
      mesh.getWorldPosition(v);
      v.project(this.camera);
      const xPx = canvasRect.left + (v.x * 0.5 + 0.5) * canvasRect.width;
      const yPx = canvasRect.top + (1 - (v.y * 0.5 + 0.5)) * canvasRect.height;
      const xPct = ((xPx - originRect.left) / originRect.width) * 100;
      el.style.left = `${xPct.toFixed(2)}%`;
      el.style.top = `${(((yPx - originRect.top) / originRect.height) * 100).toFixed(2)}%`;
      // markers on the right half get their label on the left, so it never runs off-screen
      el.classList.toggle('is-flip', xPct > 54);
    });
  }

  /* -------------------------------------------------------------- pointer */

  _setPointerNdc(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    return { nx: this.pointerNdc.x, ny: -this.pointerNdc.y };
  }

  _bindPointer() {
    if (this.reducedMotion) return;

    this._onDown = (e) => {
      this.isDragging = true;
      this.hasPointer = true;
      this.dragMoved = false;
      this._setPointerNdc(e.clientX, e.clientY);
      this._dragStartX = e.clientX;
      this._dragStartY = e.clientY;
      this._dragStartRotation = this.dragRotation;
      this.dragVelocity = 0;
      this.dragTarget = null;
      this.container.style.cursor = 'grabbing';
      this.container.setPointerCapture?.(e.pointerId);
    };

    this._onMove = (e) => {
      this.hasPointer = true;
      const { nx, ny } = this._setPointerNdc(e.clientX, e.clientY);
      if (this.isDragging) {
        const dx = e.clientX - this._dragStartX;
        const dy = e.clientY - this._dragStartY;
        // only treat this as a rotate-drag (and cancel the pending click) past a small
        // threshold, so a real tap/click on a part still registers as a selection
        if (!this.dragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          this.dragMoved = true;
          this._clearHover();
        }
        const next = this._dragStartRotation + dx * 0.011;
        this.dragVelocity = next - this.dragRotation;
        this.dragRotation = next;
      } else {
        this.mouseTarget.x = THREE.MathUtils.degToRad(2) * nx;
        this.mouseTarget.y = THREE.MathUtils.degToRad(1) * ny;
      }
    };

    this._onUp = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      if (!this.dragMoved) {
        // fresh hit test right at release — a fast tap may not have had time for the
        // throttled hover check in _tick to run yet
        this._updateHover();
        if (this.hoveredGroup) this._activate(this.hoveredGroup, { focus: true });
      }
      this.container.style.cursor = this.hoveredGroup ? 'pointer' : 'grab';
    };

    // the browser took over the gesture (e.g. a vertical page scroll on touch) — not a click
    this._onCancel = () => {
      this.isDragging = false;
      this.dragMoved = true;
      this.container.style.cursor = 'grab';
    };

    this._onLeave = () => {
      this.hasPointer = false;
      this.mouseTarget.x = 0;
      this.mouseTarget.y = 0;
      this._clearHover();
    };

    this.container.addEventListener('pointerdown', this._onDown);
    this.container.addEventListener('pointermove', this._onMove);
    this.container.addEventListener('pointercancel', this._onCancel);
    window.addEventListener('pointerup', this._onUp);
    this.container.addEventListener('pointerleave', this._onLeave);
  }

  /* --------------------------------------------------------------- resize */

  /** re-measure the container; call defensively once layout/fonts have settled */
  resize() {
    this._onResize();
  }

  _bindResize() {
    this._onResize = () => {
      const w = this.container.clientWidth || 1;
      const h = this.container.clientHeight || 1;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (this.reducedMotion && this.loaded) this._renderStatic();
    };
    window.addEventListener('resize', this._onResize);
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._lazyObserver?.disconnect();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointerup', this._onUp);
    this.container.removeEventListener('pointerdown', this._onDown);
    this.container.removeEventListener('pointermove', this._onMove);
    this.container.removeEventListener('pointercancel', this._onCancel);
    this.container.removeEventListener('pointerleave', this._onLeave);
    this._edgeCache.forEach((g) => g.dispose());
    this.tooltip.remove();
    this.loadingLabel.remove();
    this.renderer.dispose();
  }
}
