import ePub from 'epubjs';

/**
 * Elabora un file EPUB e restituisce un oggetto pronto per il database
 */
export const processEpubFile = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const bookData = e.target.result;
                const tempBook = ePub(bookData);

                // 1. Metadati e Cover
                const metadata = await tempBook.loaded.metadata;
                const tempCoverUrl = await tempBook.coverUrl();
                let persistentCover = null;

                if (tempCoverUrl) {
                    const response = await fetch(tempCoverUrl);
                    const blob = await response.blob();
                    persistentCover = await new Promise((r) => {
                        const fr = new FileReader();
                        fr.onloadend = () => r(fr.result);
                        fr.readAsDataURL(blob);
                    });
                }

                // 2. Calcolo Locations (Ottimizzato)
                await tempBook.ready;
                await tempBook.locations.generate(300);
                const savedLocations = tempBook.locations.save();

                // 3. Navigazione (ToC)
                const navigation = await tempBook.loaded.navigation;
                let tocData = [];
                const processItem = (item) => {
                    let safePct = 0;

                    if (item.href) {
                        const baseHref = item.href.split('#')[0];
                        const spineItem = tempBook.spine.get(baseHref);

                        if (spineItem) {
                            try {
                                const locationsArray = typeof savedLocations === 'string'
                                    ? JSON.parse(savedLocations)
                                    : savedLocations;

                                if (locationsArray && locationsArray.length > 0 && spineItem.cfiBase) {

                                    let foundIndex = -1;

                                    // 1. Puliamo il cfiBase dello spine per il confronto (es. da "/6/14!" a [6, 14])
                                    const spineParts = spineItem.cfiBase.replace(/[()]/g, "").split("/");
                                    const majorSpine = parseInt(spineParts[1]);
                                    const minorSpine = parseInt(spineParts[2]?.split("!")[0]);

                                    // 2. Cerchiamo l'indice nell'array
                                    for (let i = 0; i < locationsArray.length; i++) {
                                        const loc = locationsArray[i];
                                        const locParts = loc.replace(/[()]/g, "").split("/");

                                        const major = parseInt(locParts[1]);
                                        const minor = parseInt(locParts[2]?.split("!")[0]);

                                        // Troviamo la prima location che è uguale o successiva al nostro capitolo
                                        if (major > majorSpine || (major === majorSpine && minor >= minorSpine)) {
                                            foundIndex = i;
                                            break;
                                        }
                                    }

                                    if (foundIndex !== -1) {
                                        // CALCOLO MANUALE DELLA PERCENTUALE
                                        // Questo evita che epubjs ti restituisca 0
                                        safePct = foundIndex / locationsArray.length;
                                    } else {
                                        safePct = spineItem.index / tempBook.spine.length;
                                    }
                                } else {
                                    safePct = spineItem.index / tempBook.spine.length;
                                }
                            } catch (err) {
                                console.warn(`Errore processItem`, err);
                                safePct = spineItem.index / tempBook.spine.length;
                            }
                        }
                    }

                    tocData.push({
                        label: item.label?.trim() || 'Capitolo',
                        percent: Math.max(0, Math.min(safePct, 1)),
                        href: item.href,
                    });

                    if (item.subitems) item.subitems.forEach(processItem);
                };
                navigation.toc.forEach(processItem);

                const result = {
                    title: metadata.title || 'Titolo Sconosciuto',
                    author: metadata.creator || 'Autore Sconosciuto',
                    fileName: file.name,
                    fileSize: file.size,
                    file: bookData,
                    cover: persistentCover,
                    locations: savedLocations,
                    toc: tocData,
                    progress: 0,
                    currentCfi: null,
                    addedDate: Date.now()
                };

                tempBook.destroy();
                resolve(result);
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = () => reject(new Error("Errore lettura file"));
        reader.readAsArrayBuffer(file);
    });
};


class EpubService {
    constructor() {
        this.book = null;
        this.rendition = null;
        this.bookData = null;

        this.readingStats = {
            lastPercentage: null,
            lastTime: Date.now(),
            speedArray: []
        };
    }

    async init({bookData, elementId, settings, onReady, onRelocated}) {
        this.bookData = bookData;
        this.book = ePub(bookData.file);

        // 1. Inizializza il Rendition
        this.rendition = this.book.renderTo(elementId, {
            width: '100%',
            height: '100%',
            spread: 'none',
            manager: 'continuous',
            flow: settings.flow,
            allowScript: true
        });

        // 2. Registra e applica i temi
        this.rendition.themes.register('light', {body: {background: '#ffffff', color: '#000000'}});
        this.rendition.themes.register('dark', {body: {background: '#121212', color: '#e0e0e0'}});
        this.rendition.themes.register('sepia', {body: {background: '#f4ecd8', color: '#5b4636'}});

        this.applySettings(settings);

        // 3. Carica Locations se disponibili
        if (bookData.locations && bookData.locations.length > 0) {
            this.book.locations.load(bookData.locations);
        }

        // 4. Vai all'ultimo punto salvato
        await this.rendition.display(bookData.currentCfi || undefined);

        if (onReady) onReady();

        // 5. Gestisci il cambio pagina/scrolling
        this.rendition.on('relocated', (locationData) => {
            this.handleRelocated(locationData, onRelocated);
        });
    }

    handleRelocated(locationData, callback) {
        const currentCfi = locationData.start.cfi;
        const currentHref = locationData.start.href;

        let foundTitle = 'Capitolo';
        let activeIndex = -1;
        let percentage = 0;
        let timeLeftStr = '-- min';

        // --- CALCOLO CAPITOLO ---
        if (this.bookData && this.bookData.toc) {
            const cleanCurrentHref = currentHref.split('#')[0].split('/').pop();
            activeIndex = this.bookData.toc.findIndex(item => {
                if (!item.href) return false;
                return item.href.split('#')[0].split('/').pop() === cleanCurrentHref;
            });

            if (activeIndex !== -1) {
                foundTitle = this.bookData.toc[activeIndex].label.trim();
            } else {
                const navItem = this.book.navigation.get(currentHref);
                if (navItem && navItem.label) foundTitle = navItem.label.trim();
            }
        }

        // --- CALCOLO PERCENTUALE E TEMPO ---
        if (this.book.locations && this.book.locations.total > 0) {
            percentage = this.book.locations.percentageFromCfi(currentCfi);
            console.log("-----------------------")
            console.log(this.bookData.toc);
            let chapterStartPercent = this.bookData.toc[activeIndex].percentage || 1;;
            let chapterEndPercent = this.bookData.toc[activeIndex + 1].percentage || 1;;
            const max = chapterEndPercent - chapterStartPercent;
            console.log(`io sono a ${percentage * 100}%`);
            console.log(`il capitolo finisce a ${chapterEndPercent * 100}%`);


            if (this.readingStats.lastPercentage != null) {
                let deltaPercentage = percentage - this.readingStats.lastPercentage;
                console.log(`ho letto ${deltaPercentage * 100}% del capitolo`);
                if (deltaPercentage > 0) {
                    const deltaTime = Date.now() - this.readingStats.lastTime;
                    console.log(`secondi: ${deltaTime / 1000}sec`);
                    const currentSpeed = (deltaTime / 1000) / deltaPercentage;
                    console.log(`currentSpeed: ${currentSpeed}`);
                    this.readingStats.speedArray.push(currentSpeed);
                }
                else {
                    console.log("troppo veloce o indietro, non conto la velocità");
                }
            }

            const remainingChapterPercent = chapterEndPercent - percentage;
            console.log(`remainingChapterPercent: ${remainingChapterPercent * 100}%`);

            const DEFAULT_SPEED = 0.0125;

            // Calcola la media di velocità attuale
            const avgSpeed = this.readingStats.speedArray.length > 0
                ? this.readingStats.speedArray.reduce((a, b) => a + b) / this.readingStats.speedArray.length
                : DEFAULT_SPEED;
            const remainingTime = remainingChapterPercent * avgSpeed;


            timeLeftStr = `${Math.ceil(remainingTime / 60).toFixed(0)} min`;

            this.readingStats.lastTime = Date.now();
            this.readingStats.lastPercentage = percentage;

            // const totalLocs = this.book.locations.total;
            // const currentLoc = this.book.locations.locationFromCfi(currentCfi);
            //
            // // Calcola dove finisce il capitolo attuale
            // let chapterEndPercent = 1;
            // if (activeIndex !== -1 && activeIndex + 1 < this.bookData.toc.length) {
            //     chapterEndPercent = this.bookData.toc[activeIndex + 1].percent || 1;
            // }
            //
            // const chapterEndLoc = Math.floor(chapterEndPercent * totalLocs);
            // // Quante locations (blocchi di 1600 caratteri) mancano alla fine del capitolo
            // const locsToReadInChapter = Math.max(0, chapterEndLoc - currentLoc);
            //
            // console.log(locsToReadInChapter);
            //
            // // --- GESTIONE VELOCITÀ DI LETTURA ---
            // const now = Date.now();
            // const timeDiff = (now - this.readingStats.lastTime) / 1000; // Secondi passati in questa pagina
            //
            // // Se l'utente ha letto per più di 2 secondi (non sta sfogliando velocemente)
            // // e per meno di 5 minuti (non ha lasciato il tablet acceso sul tavolo)
            // if (this.readingStats.lastCfi && timeDiff > 2 && timeDiff < 300) {
            //     const lastLoc = this.book.locations.locationFromCfi(this.readingStats.lastCfi);
            //     const locsRead = currentLoc - lastLoc;
            //
            //     // Se è andato avanti (e non indietro)
            //     if (locsRead > 0) {
            //         const currentSpeed = locsRead / timeDiff; // locs/sec
            //         this.readingStats.speedArray.push(currentSpeed);
            //
            //         // Teniamo in memoria le ultime 10 pagine lette per fare una media fluida
            //         if (this.readingStats.speedArray.length > 10) {
            //             this.readingStats.speedArray.shift();
            //         }
            //     }
            // }
            //
            // // Velocità di base: 200 parole al minuto (~0.0125 locations al secondo)
            // const DEFAULT_SPEED = 0.0125;
            //
            // // Calcola la media di velocità attuale
            // const avgSpeed = this.readingStats.speedArray.length > 0
            //     ? this.readingStats.speedArray.reduce((a, b) => a + b) / this.readingStats.speedArray.length
            //     : DEFAULT_SPEED;
            //
            // // Calcolo tempo rimanente
            // const secondsLeft = locsToReadInChapter / avgSpeed;
            // const minutesLeft = Math.ceil(secondsLeft / 60);
            //
            // // Costruzione stringa UI
            // if (locsToReadInChapter <= 0) {
            //     timeLeftStr = 'Fine cap.';
            // } else if (minutesLeft < 1) {
            //     timeLeftStr = '< 1 min';
            // } else {
            //     timeLeftStr = `${minutesLeft} min`;
            // }

            // Aggiorna le statistiche per il prossimo cambio pagina
            // this.readingStats.lastTime = now;
            // this.readingStats.lastCfi = currentCfi;
        }

        // Ritorna i dati puliti a React
        if (callback) {
            callback({
                cfi: currentCfi,
                percentage: Number((percentage * 100).toFixed(1)),
                chapterTitle: foundTitle,
                chapterIndex: Math.max(0, activeIndex),
                timeLeft: timeLeftStr
            });
        }
    }

    // --- NAVIGAZIONE ---
    next() {
        if (this.rendition) this.rendition.next();
    }

    prev() {
        if (this.rendition) this.rendition.prev();
    }

    goTo(target) {
        if (this.rendition) this.rendition.display(target);
    }

    goToPercentage(percentValue) {
        if (this.rendition && this.book.locations && this.book.locations.total > 0) {
            const cfi = this.book.locations.cfiFromPercentage(percentValue / 100);
            if (cfi) this.rendition.display(cfi);
        }
    }

    applySettings(settings) {
        if (!this.rendition) return;
        this.rendition.themes.select(settings.theme);
        this.rendition.themes.font(settings.fontFamily);
        this.rendition.themes.fontSize(`${settings.fontSize}%`);
        if (this.rendition.settings.flow !== settings.flow) {
            this.rendition.flow(settings.flow);
        }
    }

    /**
     * Restituisce la lista dei capitoli (Table of Contents)
     * Ritorna un array di oggetti: { label, percent, href }
     */
    getChapters() {
        if (this.bookData && this.bookData.toc) {
            return this.bookData.toc;
        }
        return [];
    }

    /**
     * Naviga direttamente all'href di un capitolo
     * @param {string} href - L'href del capitolo ottenuto da getChapters()
     */
    goToChapter(href) {
        if (this.rendition && href) {
            this.rendition.display(href);
        }
    }

    /**
     * Restituisce i "marks" (segnalini) per lo slider basati sulla percentuale dei capitoli.
     * Utile per mostrare visivamente l'inizio dei capitoli sulla barra di progresso.
     */
    getChapterMarks() {
        if (!this.bookData || !this.bookData.toc) return [];

        return this.bookData.toc
            // Filtriamo i capitoli che hanno una percentuale valida (> 0 per non accavallarsi all'inizio)
            .filter(chapter => chapter.percent > 0)
            .map(chapter => ({
                value: Number((chapter.percent * 100).toFixed(1))
            }));
    }

    /**
     * Naviga al capitolo usando l'indice dell'array del ToC
     * @param {number} index - L'indice del capitolo nell'array
     */
    goToChapterByIndex(index) {
        if (this.bookData && this.bookData.toc && this.bookData.toc[index]) {
            const href = this.bookData.toc[index].href;
            if (this.rendition && href) {
                this.rendition.display(href);
            }
        }
    }

    destroy() {
        if (this.book) {
            this.book.destroy();
            this.book = null;
            this.rendition = null;
        }
    }
}

export const epubService = new EpubService();