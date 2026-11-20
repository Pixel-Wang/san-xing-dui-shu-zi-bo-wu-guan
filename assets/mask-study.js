const MaskStudy = (() => {
  const maskNotes = {
    eyes:'眼部上下由凸起的边线围合，中间的棱线把眼面分成明暗两块。略微转动面具，两块面的亮度会随角度变化。',
    brow:'眉脊从鼻根向两侧斜伸，眉下留出一道深凹的阴影。沿着这道阴影，可以辨出眉脊和上眼缘之间的距离。',
    nose:'鼻梁从双眼之间向前伸出，鼻端向左右扩展。斜侧观察时，鼻尖会遮住远侧鼻翼，面部的前后关系更清楚。',
    ears:'耳板向脸缘以外展开。顺着外圈边缘向内看，可以辨出折线状凸棱和耳板下方的孔形。',
    patina:'下缘带状区域可见青绿与褐色斑驳交叠。这里展示的是模型的表面着色，具体锈蚀成分仍需实物检测。'
  };
  let selected = -1;
  let currentId;
  let guideMode;
  let rotating = false;
  const element = id => document.getElementById(id);
  const active = () => document.body.dataset.study === 'yes';
  const markers = () => Array.from(element('hotspotLayer').children);

  function select(index) {
    selected = index;
    const relic = DataService.get(Store.get().relicId);
    const point = (relic.hotspots || [])[index];
    element('studyDetail').hidden = !point;
    element('studyTitle').textContent = point ? point.title : '';
    element('studyText').textContent = point ? (relic.id === 'bronze-mask' ? maskNotes[point.id] : point.text) : '';
    Array.from(element('studyIndex').children).forEach((button, i) => {
      button.setAttribute('aria-pressed', String(i === index));
    });
    markers().forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }

  function sync(state) {
    const show = state.page === 'interactive3d' && desktopExhibit.matches &&
      (state.mode === 'display' || state.mode === 'interpretation');
    document.body.dataset.study = show ? 'yes' : '';
    if (!show) {
      if (currentId) select(-1);
      currentId = null;
      rotating = false;
      return;
    }
    if (currentId === state.relicId && guideMode === state.mode) return;
    currentId = state.relicId;
    guideMode = state.mode;
    rotating = false;
    const relic = DataService.get(currentId);
    const points = relic.hotspots || [];
    const picker = element('studySelect');
    if (!picker.options.length) DataService.all().forEach(item => picker.add(new Option(DataService.field(item,'name'),item.id)));
    picker.value = currentId;
    element('studyName').textContent = DataService.field(relic,'name');
    element('studyEnglish').textContent = hallExhibits[currentId].english;
    element('studyIntro').textContent = guideMode === 'interpretation' && points.length
      ? '点击文物上的标记，或选择下方部位，查看造型解读。' : DataService.field(relic,'observation');
    element('studyGuideTitle').textContent = guideMode === 'interpretation' && points.length ? '局部解读' : '造型观察';
    element('studyIndex').replaceChildren();
    if (guideMode === 'interpretation') points.forEach((point, i) => {
      const button = document.createElement('button');
      const num = document.createElement('span');
      num.textContent = String(i+1).padStart(2,'0');
      button.append(num, point.title);
      button.onclick = () => {
        if (!markers()[i]?.classList.contains('show')) element('resetExhibit').click();
        select(i);
      };
      element('studyIndex').append(button);
    });
    select(-1);
  }
  function bind() {
    element('studySelect').onchange = event => {
      Store.set({relicId:event.target.value});
      renderAll();
    };
    element('studyClose').onclick = () => {
      const choice = element('studyIndex').children[selected];
      select(-1);
      if (choice) choice.focus();
    };
    document.addEventListener('keydown', event => {
      if (active() && selected >= 0 && event.key === 'Escape') element('studyClose').click();
    });
  }
  return {sync, bind, active, select, toggleSpin(){rotating = !rotating;}, spinning(){return rotating;}};
})();

// Visibility tests use the loaded mesh in the artifact's local coordinate system.
// Bounding boxes skip triangle batches that the camera-to-marker segment cannot cross.
function studyVisibility(model, camera) {
  if (!model.studySurface) {
    const local = model.group.matrixWorld.clone().invert();
    const batches = [];
    model.root.traverse(mesh => {
      if (!mesh.isMesh) return;
      const shape = mesh.geometry;
      const transform = new THREE.Matrix4().multiplyMatrices(local, mesh.matrixWorld);
      const positions = shape.attributes.position;
      const vertices = Array.from({length:positions.count}, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(transform));
      const indices = shape.index?.array;
      const count = indices ? indices.length : positions.count;
      for (let start=0; start<count; start+=384) {
        const end = Math.min(start+384,count);
        const box = new THREE.Box3();
        for (let j=start; j<end; j++) box.expandByPoint(vertices[indices ? indices[j] : j]);
        batches.push({vertices,indices,start,end,box});
      }
    });
    model.studySurface = {batches, eye:new THREE.Vector3(Infinity,Infinity,Infinity), visible:[]};
  }
  const surface = model.studySurface;
  const eye = model.group.worldToLocal(camera.position.clone());
  if (surface.eye.distanceToSquared(eye) < 1e-12) return surface.visible;
  surface.eye.copy(eye);
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  surface.visible = model.studyAnchors.map(anchor => {
    if (!anchor) return false;
    ray.set(eye,anchor.clone().sub(eye).normalize());
    const distance = eye.distanceTo(anchor) - model.height*.003;
    for (const {vertices,indices,start,end,box} of surface.batches) {
      if (!ray.intersectsBox(box)) continue;
      for (let j=start; j<end; j+=3) {
        const a = vertices[indices ? indices[j] : j];
        const b = vertices[indices ? indices[j+1] : j+1];
        const c = vertices[indices ? indices[j+2] : j+2];
        if (ray.intersectTriangle(a,b,c,false,hit) && hit.distanceToSquared(eye)<distance*distance) return false;
      }
    }
    return true;
  });
  return surface.visible;
}
