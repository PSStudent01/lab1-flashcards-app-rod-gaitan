/* Accessible modal component
	 - Focus trap (Tab / Shift+Tab)
	 - Close on Escape
	 - Return focus to opener
	 - Overlay click to close
	 Usage: Modal.open({ title, html: '<p>...</p>' })
*/
(function(){
	const FOCUSABLE = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';
	let modalRoot = null;
	let activeTrap = null;
	let lastActiveElement = null;

	function createModalNode(){
		const overlay = document.createElement('div');
		overlay.className = 'modal-overlay';
		overlay.style.position = 'fixed';
		overlay.style.inset = '0';
		overlay.style.background = 'rgba(2,6,23,0.5)';
		overlay.style.display = 'flex';
		overlay.style.alignItems = 'center';
		overlay.style.justifyContent = 'center';
		overlay.style.zIndex = 9999;

		const dialog = document.createElement('div');
		dialog.className = 'modal-dialog';
		dialog.setAttribute('role','dialog');
		dialog.setAttribute('aria-modal','true');
		dialog.style.background = 'var(--surface, #fff)';
		dialog.style.color = 'inherit';
		dialog.style.maxWidth = '720px';
		dialog.style.width = 'min(92%,800px)';
		dialog.style.borderRadius = '12px';
		dialog.style.padding = '20px';
		dialog.style.boxShadow = '0 10px 30px rgba(2,6,23,0.2)';

		overlay.appendChild(dialog);
		return { overlay, dialog };
	}

	function getFocusable(el){
		return Array.from(el.querySelectorAll(FOCUSABLE)).filter(n => n.offsetWidth || n.offsetHeight || n.getClientRects().length);
	}

	function trapFocus(container){
		const nodes = getFocusable(container);
		if (!nodes.length) return;
		function onKey(e){
			if (e.key === 'Tab'){
				const first = nodes[0];
				const last = nodes[nodes.length - 1];
				if (e.shiftKey){
					if (document.activeElement === first){
						e.preventDefault(); last.focus();
					}
				} else {
					if (document.activeElement === last){
						e.preventDefault(); first.focus();
					}
				}
			} else if (e.key === 'Escape'){
				e.preventDefault(); Modal.close();
			}
		}
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}

	const Modal = {
		open({ title = '', html = '' } = {}){
			if (modalRoot) return; // already open
			lastActiveElement = document.activeElement;

			const { overlay, dialog } = createModalNode();
			modalRoot = overlay;

			// build content
			if (title){
				const h = document.createElement('h2');
				h.id = 'modal-title';
				h.textContent = title;
				h.style.marginTop = '0';
				dialog.appendChild(h);
				dialog.setAttribute('aria-labelledby','modal-title');
			}

			const content = document.createElement('div');
			content.className = 'modal-content';
			if (typeof html === 'string') content.innerHTML = html;
			else if (html instanceof Node) content.appendChild(html);
			dialog.appendChild(content);

			const closeBtn = document.createElement('button');
			closeBtn.type = 'button';
			closeBtn.className = 'modal-close';
			closeBtn.textContent = 'Close';
			closeBtn.style.marginTop = '12px';
			closeBtn.addEventListener('click', ()=> Modal.close());
			dialog.appendChild(closeBtn);

			overlay.addEventListener('click', (e)=>{
				if (e.target === overlay) Modal.close();
			});

			document.body.appendChild(overlay);

			// hide background from assistive tech (use app root)
			const appRoot = document.getElementById('app') || document.querySelector('.app');
			if (appRoot) appRoot.setAttribute('aria-hidden','true');

			// prevent background scroll
			document.documentElement.style.overflow = 'hidden';

			// focus management
			const focusables = getFocusable(dialog);
			if (focusables.length) focusables[0].focus();
			else closeBtn.focus();

			// set trap
			activeTrap = trapFocus(dialog);
		},
		close(){
			if (!modalRoot) return;
			// remove trap
			if (activeTrap) { activeTrap(); activeTrap = null; }
			// remove DOM
			modalRoot.remove(); modalRoot = null;
			// restore background
			const appRoot = document.getElementById('app') || document.querySelector('.app');
			if (appRoot) appRoot.removeAttribute('aria-hidden');
			document.documentElement.style.overflow = '';
			// return focus
			try{ if (lastActiveElement && typeof lastActiveElement.focus === 'function') lastActiveElement.focus(); }catch(e){}
		}
	};

	// expose globally
	window.Modal = Modal;

	// initialize app: deck store + UI wiring
	document.addEventListener('DOMContentLoaded', ()=>{
		// In-memory deck store
		const DeckStore = {
			nextDeckId: 2,
			nextCardId: 2,
			decks: [
				{ id: 1, name: 'Sample Deck', cards: [ { id: 1, front: 'Hello', back: 'World' } ], currentIndex: 0 }
			],
			createDeck(name){
				const d = { id: this.nextDeckId++, name: name || 'Untitled', cards: [], currentIndex: 0 };
				this.decks.push(d); return d;
			},
			updateDeck(id, patch){
				const d = this.decks.find(x=>x.id===id); if (!d) return null; Object.assign(d,patch); return d;
			},
			deleteDeck(id){
				const idx = this.decks.findIndex(x=>x.id===id); if (idx===-1) return false; this.decks.splice(idx,1); return true;
			},
			getDeck(id){ return this.decks.find(x=>x.id===id) || null; }
		};

		// attempt to load saved state
		if (window.StorageHelpers && typeof window.StorageHelpers.loadState === 'function'){
			const saved = window.StorageHelpers.loadState();
			if (saved && saved.decks){
				DeckStore.decks = saved.decks;
				DeckStore.nextDeckId = saved.nextDeckId || (Math.max(0,...DeckStore.decks.map(d=>d.id))+1);
				DeckStore.nextCardId = saved.nextCardId || (Math.max(0,...DeckStore.decks.flatMap(d=>d.cards.map(c=>c.id)))+1);
			}
		}

		function persistState(){
			if (window.StorageHelpers && typeof window.StorageHelpers.saveState === 'function'){
				const payload = { decks: DeckStore.decks, nextDeckId: DeckStore.nextDeckId, nextCardId: DeckStore.nextCardId };
				window.StorageHelpers.saveState(payload);
			}
		}

		let currentDeckId = null;
		let studyState = null; // { deckId, index }
		let studyKeyHandler = null;

		// Study mode functions (top-level in DOMContentLoaded)
		function enterStudyMode(deckId){
			const deck = DeckStore.getDeck(Number(deckId));
			if (!deck) return;
			selectDeck(deck.id);
			studyState = { deckId: deck.id, index: 0 };
			studyKeyHandler = function(e){
				const tag = document.activeElement && document.activeElement.tagName;
				if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
				if (e.key === 'ArrowLeft'){ e.preventDefault(); document.getElementById('prev-card-btn')?.click(); }
				else if (e.key === 'ArrowRight'){ e.preventDefault(); document.getElementById('next-card-btn')?.click(); }
				else if (e.key === ' ' || e.code === 'Space'){ e.preventDefault(); document.getElementById('flip-card-btn')?.click(); }
				else if (e.key === 'Escape'){ e.preventDefault(); exitStudyMode(); }
			};
			document.addEventListener('keydown', studyKeyHandler);
			document.documentElement.classList.add('is-studying');
			renderCard();
		}

		function exitStudyMode(){
			if (!studyState) return;
			if (studyKeyHandler) { document.removeEventListener('keydown', studyKeyHandler); studyKeyHandler = null; }
			studyState = null;
			document.documentElement.classList.remove('is-studying');
			const cardEl = document.querySelector('.card'); if (cardEl) cardEl.classList.remove('is-flipped');
			renderCard();
		}

		window.enterStudyMode = enterStudyMode;
		window.exitStudyMode = exitStudyMode;

		const ui = {
			deckList: document.getElementById('deck-list'),
			deckTitle: document.getElementById('deck-title'),
			cardFront: document.querySelector('.card-front'),
			cardBack: document.querySelector('.card-back')
		};

		function renderDeckList(){
			const root = ui.deckList; if (!root) return;
			root.innerHTML = '';
			if (!DeckStore.decks.length){
				root.innerHTML = `
					<li class="empty-state" role="listitem">
						<div class="empty-state" style="padding:16px;text-align:center">
							<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7h18M5 11h14M7 15h10" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
							<h3>No decks yet</h3>
							<p>Create your first deck to get started.</p>
							<button type="button" class="create-deck-empty">Create Deck</button>
						</div>
					</li>`;
				// attach handler
				const btn = root.querySelector('.create-deck-empty'); if (btn) btn.addEventListener('click', ()=> document.getElementById('new-deck-btn')?.click());
				return;
			}
			DeckStore.decks.forEach(d => {
				const li = document.createElement('li');
				li.tabIndex = 0;
				li.dataset.deckId = d.id;
				li.className = 'deck-item';
				li.setAttribute('role','listitem');
				li.innerHTML = `<span class="deck-name">${escapeHtml(d.name)}</span> <button type="button" class="deck-delete" aria-label="Delete ${escapeHtml(d.name)}">✕</button>`;
				if (d.id === currentDeckId){ li.classList.add('active'); li.setAttribute('aria-current','true'); }
				root.appendChild(li);
			});
		}

		function escapeHtml(str){ return String(str).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[s]); }

		function selectDeck(id){
			const deck = DeckStore.getDeck(Number(id));
			currentDeckId = deck ? deck.id : null;
			if (ui.deckTitle) {
				ui.deckTitle.textContent = deck ? deck.name : 'Select a deck';
				ui.deckTitle.focus();
			}
			renderDeckList();
			renderCard();
		}

    		function renderCard(){
			const deck = DeckStore.getDeck(Number(currentDeckId));
				const cardArea = document.querySelector('.card-area');
				let cardEl = document.querySelector('.card');
			// ensure inner wrapper exists for 3D flip
				if (!cardEl && cardArea){
					// create base structure
					cardArea.innerHTML = `<article class="card">
						<div class="card-front"></div>
						<div class="card-back"></div>
					</article>`;
					cardEl = document.querySelector('.card');
				}

				// if no deck, show empty-state
				if (!deck){
					if (cardArea){
						cardArea.innerHTML = `
							<div class="empty-state" role="region" aria-live="polite">
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<h3>No deck selected</h3>
								<p>Select or create a deck from the left to begin.</p>
							</div>`;
					}
					return;
				}

				// deck exists but has no cards -> show empty instructive state
				if (deck.cards.length === 0){
					if (cardArea){
						cardArea.innerHTML = `
							<div class="empty-state" role="region" aria-live="polite">
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7h18M5 11h14M7 15h10" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<h3>No cards in this deck</h3>
								<p>Add your first card to start studying.</p>
								<button type="button" class="create-card-empty">Add Card</button>
							</div>`;
						const btn = cardArea.querySelector('.create-card-empty'); if (btn) btn.addEventListener('click', ()=> document.getElementById('new-card-btn')?.click());
					}
					return;
				}

				// ensure inner wrapper exists for 3D flip when there are cards
				if (cardEl && !cardEl.querySelector('.card-inner')){
					const front = cardEl.querySelector('.card-front');
					const back = cardEl.querySelector('.card-back');
					const inner = document.createElement('div'); inner.className = 'card-inner';
					if (front) inner.appendChild(front);
					if (back) inner.appendChild(back);
					cardEl.appendChild(inner);
				}

			// if in study mode for this deck, use study index, otherwise deck.currentIndex
			const idx = (studyState && studyState.deckId === deck.id) ? (studyState.index || 0) : (deck.currentIndex || 0);
			const card = deck.cards[idx];
			if (card){
				if (ui.cardFront) ui.cardFront.textContent = card.front || '';
				if (ui.cardBack) ui.cardBack.textContent = card.back || '';
				if (cardEl) cardEl.classList.remove('is-flipped');
			} else {
				if (ui.cardFront) ui.cardFront.textContent = 'No cards';
				if (ui.cardBack) ui.cardBack.textContent = '';
				if (cardEl) cardEl.classList.remove('is-flipped');
			}
		}

		// deck list interactions (delegation)
		if (ui.deckList){
			ui.deckList.addEventListener('click', (e)=>{
				const del = e.target.closest('.deck-delete');
				if (del){
					const li = del.closest('li'); const id = Number(li.dataset.deckId);
					if (confirm('Delete this deck?')){ DeckStore.deleteDeck(id); if (currentDeckId===id) currentDeckId = null; renderDeckList(); renderCard(); persistState(); }
					return;
				}
				const li = e.target.closest('li'); if (!li) return; selectDeck(li.dataset.deckId);
			});
			ui.deckList.addEventListener('keydown', (e)=>{
				if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li')){ e.preventDefault(); selectDeck(e.target.dataset.deckId); }
			});
		}

		// new deck form via modal
		const newDeckBtn = document.getElementById('new-deck-btn');
		if (newDeckBtn){
			newDeckBtn.addEventListener('click', ()=>{
				const form = document.createElement('form');
				form.innerHTML = `
					<label>Deck name<br/><input name="name" required autofocus /></label>
					<div style="margin-top:12px"><button type="submit">Create</button> <button type="button" class="cancel">Cancel</button></div>
				`;
				form.addEventListener('submit', (ev)=>{
					ev.preventDefault(); const name = (form.name.value || '').trim(); if (!name) return; const d = DeckStore.createDeck(name); Modal.close(); selectDeck(d.id); renderDeckList(); persistState();
				});
				form.querySelector('.cancel').addEventListener('click', ()=> Modal.close());
				Modal.open({ title: 'Create Deck', html: form });
			});
		}

		// new card button
		const newCardBtn = document.getElementById('new-card-btn');
		if (newCardBtn){
			newCardBtn.addEventListener('click', ()=>{
				if (!currentDeckId){ alert('Select a deck first'); return; }
				const form = document.createElement('form');
				form.innerHTML = `
					<label>Front<br/><input name="front" required autofocus /></label>
					<label style="display:block;margin-top:8px">Back<br/><input name="back" /></label>
					<div style="margin-top:12px"><button type="submit">Add Card</button> <button type="button" class="cancel">Cancel</button></div>
				`;
				form.addEventListener('submit', (ev)=>{
					ev.preventDefault(); const front = (form.front.value||'').trim(); const back = (form.back.value||'').trim(); if (!front) return;
					const deck = DeckStore.getDeck(Number(currentDeckId));
					deck.cards.push({ id: DeckStore.nextCardId++, front, back });
					Modal.close(); renderCard(); persistState();
				});
				form.querySelector('.cancel').addEventListener('click', ()=> Modal.close());
				Modal.open({ title: 'New Card', html: form });
			});
		}

		// basic card controls: prev, next, flip
		document.getElementById('prev-card-btn')?.addEventListener('click', ()=>{
			const deck = DeckStore.getDeck(Number(currentDeckId)); if (!deck || !deck.cards.length) return;
			// if search matches are present, navigate within matches
			const matches = deck._searchMatches || null;
			if (matches && matches.length){
				// find current position in matches
				const cur = (studyState && studyState.deckId === deck.id) ? (studyState.index||0) : (deck.currentIndex||0);
				let pos = matches.indexOf(cur);
				if (pos === -1) pos = 0;
				pos = Math.max(0, pos - 1);
				const newIdx = matches[pos];
				if (studyState && studyState.deckId === deck.id) studyState.index = newIdx; else deck.currentIndex = newIdx;
			} else {
				if (studyState && studyState.deckId === deck.id){ studyState.index = Math.max(0, (studyState.index||0) - 1); }
				else { deck.currentIndex = Math.max(0, (deck.currentIndex||0) - 1); }
			}
			renderCard();
		});
		document.getElementById('next-card-btn')?.addEventListener('click', ()=>{
			const deck = DeckStore.getDeck(Number(currentDeckId)); if (!deck || !deck.cards.length) return;
			const matches = deck._searchMatches || null;
			if (matches && matches.length){
				const cur = (studyState && studyState.deckId === deck.id) ? (studyState.index||0) : (deck.currentIndex||0);
				let pos = matches.indexOf(cur);
				if (pos === -1) pos = 0;
				pos = Math.min(matches.length - 1, pos + 1);
				const newIdx = matches[pos];
				if (studyState && studyState.deckId === deck.id) studyState.index = newIdx; else deck.currentIndex = newIdx;
			} else {
				if (studyState && studyState.deckId === deck.id){ studyState.index = Math.min(deck.cards.length - 1, (studyState.index||0) + 1); }
				else { deck.currentIndex = Math.min(deck.cards.length - 1, (deck.currentIndex||0) + 1); }
			}
			renderCard();
		});
		document.getElementById('flip-card-btn')?.addEventListener('click', ()=>{
			const cardEl = document.querySelector('.card'); if (!cardEl) return; cardEl.classList.toggle('is-flipped');
		});

		// delegated card actions: edit / delete
		document.addEventListener('click', (e)=>{
			const actionEl = e.target.closest('[data-action]');
			if (!actionEl) return;
			const action = actionEl.dataset.action;
			const deck = DeckStore.getDeck(Number(currentDeckId));
			if (!deck) return alert('Select a deck first');
			const idx = deck.currentIndex || 0;
			const card = deck.cards[idx];

			if (action === 'edit-card'){
				if (!card) return alert('No card to edit');
				const form = document.createElement('form');
				form.innerHTML = `
					<label>Front<br/><input name="front" required autofocus value="${escapeHtml(card.front)}" /></label>
					<label style="display:block;margin-top:8px">Back<br/><input name="back" value="${escapeHtml(card.back)}" /></label>
					<div style="margin-top:12px"><button type="submit">Save</button> <button type="button" class="cancel">Cancel</button></div>
				`;
				form.addEventListener('submit', (ev)=>{
					ev.preventDefault(); card.front = form.front.value.trim(); card.back = form.back.value.trim(); Modal.close(); renderCard(); persistState();
				});



				form.querySelector('.cancel').addEventListener('click', ()=> Modal.close());
				Modal.open({ title: 'Edit Card', html: form });
				form.querySelector('.cancel').addEventListener('click', ()=> Modal.close());
				Modal.open({ title: 'Edit Card', html: form });
			}

			if (action === 'delete-card'){
				if (!card) return alert('No card to delete');
				if (!confirm('Delete this card?')) return;
				deck.cards.splice(idx,1);
				// fix index
				if (deck.currentIndex >= deck.cards.length) deck.currentIndex = Math.max(0, deck.cards.length - 1);
				renderCard();
				persistState();
			}
		});

		// initial render
		renderDeckList();
		if (DeckStore.decks.length) selectDeck(DeckStore.decks[0].id);

		// --- Search: debounced 300ms ---
		const searchInput = document.getElementById('card-search');
		const searchCount = document.getElementById('search-count');

		function debounce(fn, wait){
			let t = null; return function(...args){ clearTimeout(t); t = setTimeout(()=> fn.apply(this,args), wait); };
		}

		function runSearch(query){
			query = String(query || '').trim().toLowerCase();
			const deck = DeckStore.getDeck(Number(currentDeckId));
			if (!deck || !deck.cards.length){ if (searchCount) searchCount.textContent = ''; if (deck) deck._searchMatches = null; return; }
			if (!query){ deck._searchMatches = null; if (searchCount) searchCount.textContent = ''; return; }
			const indices = deck.cards.map((c,i)=> ({c,i})).filter(x=> (String(x.c.front||'').toLowerCase().includes(query) || String(x.c.back||'').toLowerCase().includes(query))).map(x=>x.i);
			deck._searchMatches = indices;
			if (searchCount) searchCount.textContent = `${indices.length} match${indices.length===1?'':'es'}`;
			// jump to first match
			if (indices.length) { const newIdx = indices[0]; if (studyState && studyState.deckId === deck.id) studyState.index = newIdx; else deck.currentIndex = newIdx; }
			renderCard();
		}

		const debouncedSearch = debounce(runSearch,300);
		if (searchInput){
			searchInput.addEventListener('input', (e)=> debouncedSearch(e.target.value));
		}
	});

})();

