/* storage.js
   - provides loadState() and saveState()
   - versioned payload and safe parse fallback
*/
(function(){
  const KEY = 'flashcards_app_state';
  const VERSION = 1;

  function safeParse(str){
    try{ return JSON.parse(str); }catch(e){ return null; }
  }

  function loadState(){
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = safeParse(raw);
    if (!parsed) return null;
    if (typeof parsed.version !== 'number' || parsed.version !== VERSION) {
      // unknown version — could implement migrations here
      return null;
    }
    return parsed.state || null;
  }

  function saveState(state){
    try{
      const payload = { version: VERSION, state };
      localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    }catch(e){
      return false;
    }
  }

  window.StorageHelpers = { loadState, saveState };
})();
