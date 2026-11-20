/* Coordinates are normalized to the model-derived plate, including its margins. */
const Observation = (() => {
  const routes = {
    'bronze-mask':['读一张脸','沿脸缘寻找向画面右侧展开的耳板。','回到两眼之间，找到向前突出的鼻端。','耳板把轮廓向两侧拉宽，鼻梁则把面部推向前方。'],
    'bronze-tree':['循枝至根','从顶端向下，寻找主干右侧弯垂的上层枝条。','顺着贯穿枝层的树干，追到最下方承托它的底座。','上层弯枝向外舒展，各层又通过同一根树干连到底座。'],
    'bronze-standing':['丈量手势','在胸前两处环握的手中，找到位置较高的一只。','沿双臂向下比较，寻找较低的另一只环握手。','双手一高一低，手指围出空处。仅凭这种姿态，无法确定手中原有何物。'],
    'bronze-zongmu':['辨认两个方向','观察斜侧图，寻找朝你伸出的眼柱端部，与样片对照。','再找向画面右方展开的宽耳，留意边缘的折线。','眼柱向前突出，双耳向外展开。斜侧视角把两种伸展方向区分开来。'],
    'gold-mask':['沿折面追光','顺着画面右侧眼缘向上，寻找眉脊形成的折面。','沿面部中线向下，找到鼻梁向鼻翼过渡的位置。','眉脊与鼻梁的折面改变了受光方向，明暗交界让面部的起伏更容易辨认。'],
    'bronze-head':['读出纵向轮廓','从眉眼向上，找到头顶较宽的面。','沿下颌向下，定位与头部相连的颈段。','把头顶、下颌和颈部连起来看，人头像的纵向体量就显现出来。'],
    'bronze-bird-bell':['从飞鸟到铃口','沿羽冠看向鸟头前方，找到侧面突出的鸟喙。','从鸟身经过连接处向下，找到逐渐展宽的铃体下口。','鸟喙勾出上部的鸟形，铃口展开下部的器身，两者通过中间的连接处合为一体。'],
    'jade-zhang':['辨齿与孔','沿画面右侧的器缘移动，找出打断直边的凸齿。','往下回到器身宽面，找到被玉料包围的穿孔。','牙饰改变了外缘，穿孔则在器身内部围出边界。这两类轮廓都能在宽面上观察。']
  };
  const $ = id => document.getElementById(id);
  const key = 'museum.observation.v1';
  let records = {};
  try { records = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
  if (typeof records !== 'object' || Array.isArray(records)) records = {};
  let id, step, cursor, url, ready = false;
  const count = item => [1,2].includes(records[item]) ? records[item] : 0;
  function crop(el, point, zoom) {
    el.style.backgroundSize = zoom*100+'%';
    el.style.backgroundPosition = point.map(v => (v*zoom-.5)/(zoom-1)*100+'%').join(' ');
    el.style.backgroundImage = 'url("'+url+'")';
  }
  function move(x,y) {
    cursor = [x,y].map(v=>Math.max(0,Math.min(1,v)));
    const lens = $('traceLens');
    lens.style.left = cursor[0]*100+'%';
    lens.style.top = cursor[1]*100+'%';
    // Lens diameter is 23% of the plate. Sampling 1/9 of the plate gives about 2x magnification.
    crop(lens,cursor,9);
  }
  function render() {
    const culture = $('traceCulture');
    culture.hidden = step !== 2;
    culture.open = false;
    if (step === 2) {
      const meta = DataService.fieldMeta(DataService.get(id),'meaning');
      culture.querySelector('p').textContent = meta.value;
      culture.querySelector('div').innerHTML = sourceLinks(meta.refs);
    }
    const done = step===2, route = routes[id], points = observationAnchors[id];
    $('traceRoute').textContent = route[0];
    $('traceName').textContent = DataService.field(DataService.get(id),'name');
    $('traceSelect').value=id;
    $('traceLedger').textContent = Object.keys(routes).filter(k=>count(k)===2).length+' / 8 件已记录';
    $('traceNumber').textContent = done ? '观察记录' : '局部取样　'+(step+1)+' / 2';
    $('tracePrompt').textContent = done ? route[3] : route[step+1];
    $('traceSample').hidden = $('traceLens').hidden = $('traceConfirm').hidden = $('traceHint').hidden = done;
    $('traceReplay').hidden = $('traceNext').hidden = !done;
    $('traceHelp').hidden=done;
    $('traceBoard').tabIndex=done ? -1 : 0;
    $('traceMarks').replaceChildren();
    points.slice(0,step).forEach(([x,y],i)=>{
      const mark=document.createElement('span');
      mark.textContent=i+1; mark.style.left=x*100+'%'; mark.style.top=y*100+'%';
      $('traceMarks').append(mark);
    });
    if (!done) {
      crop($('traceSample'),points[step],6);
      move(.23,.63);
    }
  }
  function open(item) {
    if (item===id) return;
    id=item; step=count(id); ready=false;
    url='assets/observation/'+id+'.webp';
    const img=$('traceImage');
    img.onload=()=>{ready=true; $('traceConfirm').disabled=false;};
    img.onerror=()=>{$('traceFeedback').textContent='观察图加载失败，请重试。'; $('traceRetry').hidden=false;};
    $('traceRetry').hidden=true;
    $('traceConfirm').disabled=true;
    img.alt=DataService.field(DataService.get(id),'name')+'模型表面取样图';
    img.src=url;
    $('traceFeedback').textContent='';
    render();
  }
  function confirm() {
    if (!ready || step===2) return;
    const [x,y]=observationAnchors[id][step];
    const distance=Math.hypot(cursor[0]-x,cursor[1]-y);
    if (distance>Math.max(.048,16/$('traceBoard').clientWidth)) {
      $('traceFeedback').textContent=distance<.15 ? '已经很接近，再比对样片中央的轮廓。' : '这处轮廓与样片不同。可用方位提示缩小范围。';
      return;
    }
    ++step;
    records[id]=Math.max(count(id),step);
    try { localStorage.setItem(key,JSON.stringify(records)); } catch {}
    render();
    $('traceFeedback').textContent=step===1 ? '第一处已标记。请继续比对第二张样片。' : '两处已标记，本件观察完成。';
    (step===2 ? $('traceNext') : $('traceBoard')).focus({preventScroll:true});
  }
  function bind() {
    const board=$('traceBoard');
    DataService.all().forEach(r=>$('traceSelect').add(new Option(DataService.field(r,'name'),r.id)));
    function choose(item) { Store.set({relicId:item}); renderAll(); }
    $('traceSelect').onchange=e=>choose(e.target.value);
    $('traceReplay').onclick=()=>{step=0;render();$('traceFeedback').textContent='重新观察第一处。';board.focus();};
    $('traceNext').onclick=()=>{
      const ids=DataService.all().map(r=>r.id), start=ids.indexOf(id);
      const order=ids.slice(start+1).concat(ids.slice(0,start+1));
      choose(order.find(k=>count(k)<2) || order[0]);
      $('traceSelect').focus({preventScroll:true});
    };
    $('traceRetry').onclick=()=>{const old=id;id=null;open(old);};
    $('traceHint').onclick=()=>{
      const [x,y]=observationAnchors[id][step];
      $('traceFeedback').textContent='方位提示 · '+(y<.38?'上部':y>.62?'下部':'中部')+'，'+(x<.45?'中线左侧':x>.55?'中线右侧':'靠近中线')+'。';
    };
    $('traceConfirm').onclick=confirm;
    function point(e) {
      const r=board.getBoundingClientRect();
      move((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);
    }
    board.onpointerdown=e=>{if(step!==2 && e.isPrimary){board.setPointerCapture(e.pointerId);point(e);}};
    board.onpointermove=e=>{if(step!==2 && board.hasPointerCapture(e.pointerId))point(e);};
    board.onkeydown=e=>{
      if(step===2)return;
      const dirs={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(dirs[e.key]){e.preventDefault();move(...cursor.map((v,i)=>v+dirs[e.key][i]*(e.shiftKey?.075:.015)));}
      if(e.key==='Enter'||e.key===' '){e.preventDefault();confirm();}
    };
  }
  return {bind,open};
})();
