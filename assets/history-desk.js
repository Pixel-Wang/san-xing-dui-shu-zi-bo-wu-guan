const HistoryDesk = (() => {
  const el = id => document.getElementById(id);
  let currentId, chapter = 'discovery';

  function readChapter(key) {
    chapter = key;
    const field = DataService.fieldMeta(DataService.get(currentId), key);
    el('historyText').textContent = field.value;
    el('historyRefs').open = false;
    el('historyLinks').innerHTML = sourceLinks(field.refs);
    el('historyRefCount').textContent = field.refs.length + ' 项';
    for (const button of el('historyChapters').children) {
      button.setAttribute('aria-pressed', String(button.dataset.key === key));
    }
  }

  function sync(state) {
    const active = state.page === 'interactive3d' && state.mode === 'history' && desktopExhibit.matches;
    document.body.toggleAttribute('data-history-desk', active);
    if (!active || currentId === state.relicId) return;
    currentId = state.relicId;
    const relic = DataService.get(currentId);
    el('historySelect').value = currentId;
    el('historyName').textContent = DataService.field(relic, 'name');
    el('historyEnglish').textContent = hallExhibits[currentId].english;
    el('historyYear').textContent = relic.culture.year;
    el('historyReference').textContent = DataService.field(relic,'reference');
    readChapter(chapter);
  }

  function bind() {
    const picker = el('historySelect');
    DataService.all().forEach(r => picker.add(new Option(DataService.field(r,'name'),r.id)));
    picker.onchange = () => { Store.set({relicId:picker.value}); renderAll(); };
    for (const button of el('historyChapters').children) {
      button.onclick = () => readChapter(button.dataset.key);
    }
  }
  return {sync,bind};
})();
