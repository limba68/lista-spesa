let items = JSON.parse(localStorage.getItem('secure_shopping_items')) || [];
let systemPassword = localStorage.getItem('secure_app_password');
let audioUnlocked = false;

document.addEventListener('DOMContentLoaded', () => {
    if (!systemPassword) {
        const titleEl = document.getElementById('login-title');
        const descEl = document.getElementById('login-desc');
        if (titleEl) titleEl.innerText = '🆕 Imposta Password';
        if (descEl) descEl.innerText = 'Scegli un codice segreto di sblocco per questa applicazione.';
    }
});

function unlockAudio() {
    if (audioUnlocked) return;
    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(u);
        audioUnlocked = true;
    }
}

function checkPassword(e) {
    e.preventDefault();
    unlockAudio();
    const input = document.getElementById('password-input').value;
    if (!systemPassword) {
        if (input.trim().length < 4) { alert("Usa almeno 4 caratteri."); return; }
        localStorage.setItem('secure_app_password', input); systemPassword = input; unlockApp();
    } else {
        if (input === systemPassword) { unlockApp(); } else { alert("Password errata!"); document.getElementById('password-input').value = ''; }
    }
}

function unlockApp() { 
    document.getElementById('login-screen').style.display = 'none'; 
    document.getElementById('app-screen').style.display = 'block'; 
    renderItems(); 
}

function logout() { 
    document.getElementById('password-input').value = ''; 
    document.getElementById('app-screen').style.display = 'none'; 
    document.getElementById('login-screen').style.display = 'flex'; 
}

function saveItems() { localStorage.setItem('secure_shopping_items', JSON.stringify(items)); }

function notifyUser(textMessage, vocalMessage, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = textMessage;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);

    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const utterance = new SpeechSynthesisUtterance(vocalMessage);
        utterance.lang = 'it-IT';
        utterance.rate = 1.1; 
        window.speechSynthesis.speak(utterance);
    }
}

function scanImage(input) {
    if (!input.files || input.files.length === 0) return;
    unlockAudio();
    
    const file = input.files[0];
    const btnScan = document.getElementById('btn-scan');
    const originalText = btnScan.innerHTML;
    
    btnScan.disabled = true;
    btnScan.style.opacity = "0.6";
    btnScan.innerText = "⏳ Analisi...";
    
    notifyUser("🔍 Lettura e ottimizzazione...", "Sto elaborando l'immagine velocemente.", "info");

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxW = 1000;
            const scale = maxW / img.width;
            canvas.width = maxW;
            canvas.height = img.height * scale;
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.75);

            Tesseract.recognize(
                optimizedBase64,
                'ita',
                { cacheMethod: 'write', workerBlobURL: false }
            ).then(({ data: { text } }) => {
                if (!text || text.trim() === "") {
                    notifyUser("❌ Nessun testo trovato", "Non ho trovato scritte leggibili.", "danger");
                    return;
                }

                const lines = text.split('\n');
                let aggiuntiCount = 0;
                let aggiornatiCount = 0;

                lines.forEach(line => {
                    let cleanName = line.replace(/[\\|#*_\-\[\]\{\}]/g, '').trim();
                    cleanName = cleanName.replace(/\s\d+[\.,]\d{2}$/, '').trim();
                    cleanName = cleanName.replace(/^\d+\s+/, '').trim();

                    if (cleanName.length > 2 && isNaN(cleanName)) {
                        const existingItem = items.find(item => item.name.toLowerCase() === cleanName.toLowerCase() && !item.isPromo);
                        
                        if (existingItem) {
                            existingItem.quantity += 1;
                            aggiornatiCount++;
                        } else {
                            items.push({ id: Date.now() + Math.random(), name: cleanName, isPromo: false, completed: false, quantity: 1 });
                            aggiuntiCount++;
                        }
                    }
                });

                saveItems();
                renderItems();
                
                const resText = `Scansione: +${aggiuntiCount} articoli, aggiornati ${aggiornatiCount}.`;
                const resVocal = `Scansione completata. Ho inserito ${aggiuntiCount} nuovi prodotti.`;
                notifyUser(resText, resVocal, 'info');

            }).catch(err => {
                console.error(err);
                notifyUser("❌ Errore di lettura", "Impossibile elaborare questa immagine.", "danger");
            }).finally(() => {
                btnScan.disabled = false;
                btnScan.style.opacity = "1";
                btnScan.innerHTML = originalText;
                input.value = ""; 
            });
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
