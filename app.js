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

			// hide background from assistive tech
			const appLayout = document.querySelector('.app-layout');
			if (appLayout) appLayout.setAttribute('aria-hidden','true');

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
			const appLayout = document.querySelector('.app-layout');
			if (appLayout) appLayout.removeAttribute('aria-hidden');
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

		let currentDeckId = null;

		const ui = {
			deckList: document.getElementById('deck-list'),
			deckTitle: document.getElementById('deck-title'),
			cardFront: document.querySelector('.card-front'),
			cardBack: document.querySelector('.card-back')
		};

		function renderDeckList(){
			const root = ui.deckList; if (!root) return;
			root.innerHTML = '';
			DeckStore.decks.forEach(d => {
				const li = document.createElement('li');
				li.tabIndex = 0;
				li.dataset.deckId = d.id;
				li.className = 'deck-item';
				li.innerHTML = `<span class="deck-name">${escapeHtml(d.name)}</span> <button class="deck-delete" aria-label="Delete ${escapeHtml(d.name)}">✕</button>`;
				if (d.id === currentDeckId) li.classList.add('active');
				root.appendChild(li);
			});
		}

		function escapeHtml(str){ return String(str).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[s]); }

		function selectDeck(id){
			const deck = DeckStore.getDeck(Number(id));
			currentDeckId = deck ? deck.id : null;
			if (ui.deckTitle) ui.deckTitle.textContent = deck ? deck.name : 'Select a deck';
			renderDeckList();
			renderCard();
		}

		function renderCard(){
			const deck = DeckStore.getDeck(Number(currentDeckId));
			const cardEl = document.querySelector('.card');
			// ensure inner wrapper exists for 3D flip
			if (cardEl && !cardEl.querySelector('.card-inner')){
				const front = cardEl.querySelector('.card-front');
				const back = cardEl.querySelector('.card-back');
				const inner = document.createElement('div'); inner.className = 'card-inner';
				// move faces into inner
				if (front) inner.appendChild(front);
				if (back) inner.appendChild(back);
				cardEl.appendChild(inner);
			}

			if (!deck){
				if (ui.cardFront) ui.cardFront.textContent = 'Front';
				if (ui.cardBack) ui.cardBack.textContent = 'Back';
				if (cardEl) cardEl.classList.remove('is-flipped');
				return;
			}
			const idx = deck.currentIndex || 0;
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
					if (confirm('Delete this deck?')){ DeckStore.deleteDeck(id); if (currentDeckId===id) currentDeckId = null; renderDeckList(); renderCard(); }
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
					ev.preventDefault(); const name = (form.name.value || '').trim(); if (!name) return; const d = DeckStore.createDeck(name); Modal.close(); selectDeck(d.id); renderDeckList();
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
					Modal.close(); renderCard();
				});
				form.querySelector('.cancel').addEventListener('click', ()=> Modal.close());
				Modal.open({ title: 'New Card', html: form });
			});
		}

		// basic card controls: prev, next, flip
		document.getElementById('prev-card-btn')?.addEventListener('click', ()=>{
			const deck = DeckStore.getDeck(Number(currentDeckId)); if (!deck || !deck.cards.length) return; deck.currentIndex = Math.max(0, (deck.currentIndex||0) - 1); renderCard();
		});
		document.getElementById('next-card-btn')?.addEventListener('click', ()=>{
			const deck = DeckStore.getDeck(Number(currentDeckId)); if (!deck || !deck.cards.length) return; deck.currentIndex = Math.min(deck.cards.length - 1, (deck.currentIndex||0) + 1); renderCard();
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
					ev.preventDefault(); card.front = form.front.value.trim(); card.back = form.back.value.trim(); Modal.close(); renderCard();
				});
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
			}
		});

		// initial render
		renderDeckList();
		if (DeckStore.decks.length) selectDeck(DeckStore.decks[0].id);
	});

})();

