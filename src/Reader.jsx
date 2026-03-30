import React, { useEffect, useRef, useState } from 'react';
import ePub from 'epubjs';
import { db } from './db';
import {
    AppBar, Toolbar, Typography, IconButton, Box, Slider, CircularProgress,
    Dialog, DialogTitle, DialogContent, FormControl, InputLabel, Select, MenuItem,
    ToggleButtonGroup, ToggleButton, Divider, Drawer, List, ListItem, ListItemButton, ListItemText
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';

const PURPLE = '#5e35b1';

export default function Reader({ bookId, onClose }) {
    const viewerRef = useRef(null);
    const bookRef = useRef(null);
    const renditionRef = useRef(null);

    const [rendition, setRendition] = useState(null);
    const [bookTitle, setBookTitle] = useState('Caricamento...');
    const [time, setTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    const [isBookReady, setIsBookReady] = useState(false);
    const [bookProgress, setBookProgress] = useState(0);
    const [chapterStats, setChapterStats] = useState({ progress: 0, timeLeft: 'Calcolo...', title: '' });
    const [chaptersMarks, setChaptersMarks] = useState([]);

    // Stato per l'Indice
    const [toc, setToc] = useState([]);
    const [isTocOpen, setIsTocOpen] = useState(false);
    const [currentChapterIndex, setCurrentChapterIndex] = useState(-1);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState({
        fontSize: 100, fontFamily: 'sans-serif', theme: 'light', flow: 'paginated'
    });

    const themeColors = {
        light: { bg: '#ffffff', text: '#000000', barBg: '#ffffff', active: 'rgba(94, 53, 177, 0.08)' },
        dark: { bg: '#121212', text: '#e0e0e0', barBg: '#121212', active: 'rgba(255, 255, 255, 0.08)' },
        sepia: { bg: '#f4ecd8', text: '#5b4636', barBg: '#f4ecd8', active: 'rgba(91, 70, 54, 0.1)' }
    };
    const currentTheme = themeColors[settings.theme];

    const tocRef = useRef([]);
    const lastTurnRef = useRef({ time: Date.now(), percent: 0 });
    const speedsRef = useRef([]);

    // Orologio
    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }, 10000);
        return () => clearInterval(timer);
    }, []);

    // Scroll automatico sul capitolo attivo nel Drawer
    useEffect(() => {
        if (isTocOpen && currentChapterIndex !== -1) {
            setTimeout(() => {
                const activeElement = document.getElementById(`toc-item-${currentChapterIndex}`);
                if (activeElement) {
                    activeElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
            }, 100);
        }
    }, [isTocOpen, currentChapterIndex]);

    // Gestione Frecce Tastiera
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isSettingsOpen || isTocOpen) return;
            if (!renditionRef.current) return;
            if (e.key === 'ArrowRight') renditionRef.current.next();
            else if (e.key === 'ArrowLeft') renditionRef.current.prev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSettingsOpen, isTocOpen]);

    // Applicazione Impostazioni (Tema, Font)
    useEffect(() => {
        if (rendition) {
            rendition.themes.select(settings.theme);
            rendition.themes.font(settings.fontFamily);
            rendition.themes.fontSize(`${settings.fontSize}%`);
            if (rendition.settings.flow !== settings.flow) rendition.flow(settings.flow);
        }
    }, [settings, rendition]);

    // Inizializzazione Libro
    useEffect(() => {
        let isMounted = true;
        const loadBook = async () => {
            try {
                const bookData = await db.books.get(bookId);
                if (!bookData || !isMounted) return;

                setBookTitle(bookData.title);
                const bookInstance = ePub(bookData.file);
                bookRef.current = bookInstance;

                // allowScript: true previene gli errori della sandbox
                const newRendition = bookInstance.renderTo(viewerRef.current, {
                    width: '100%', height: '100%', spread: 'none', manager: 'continuous', flow: settings.flow,
                    allowScript: true
                });

                newRendition.themes.register('light', { body: { background: '#ffffff', color: '#000000' } });
                newRendition.themes.register('dark', { body: { background: '#121212', color: '#e0e0e0' } });
                newRendition.themes.register('sepia', { body: { background: '#f4ecd8', color: '#5b4636' } });

                setRendition(newRendition);
                renditionRef.current = newRendition;

                await newRendition.display(bookData.currentCfi || undefined);
                if (!isMounted) return;
                setIsBookReady(true);

                // Click sui lati per cambiare pagina
                newRendition.on('click', (e) => {
                    const selection = e.view ? e.view.getSelection().toString() : '';
                    if (selection.length > 0) return;
                    if (settings.flow !== 'paginated') return;

                    const clickX = e.screenX;
                    const viewWidth = window.innerWidth;
                    const sideZone = viewWidth * 0.3;

                    if (clickX < sideZone) newRendition.prev();
                    else if (clickX > viewWidth - sideZone) newRendition.next();
                });

                // Cambio pagina con tastiera dentro l'iframe
                newRendition.on('keydown', (e) => {
                    if (e.key === 'ArrowRight') newRendition.next();
                    if (e.key === 'ArrowLeft') newRendition.prev();
                });

                // Gestione spostamento e salvataggio posizione
                newRendition.on('relocated', (locationData) => {
                    if (!isMounted) return;
                    const currentCfi = locationData.start.cfi;
                    const currentHref = locationData.start.href;
                    let updateData = { currentCfi: currentCfi };

                    const tocData = tocRef.current;
                    if (tocData.length > 0) {
                        let activeIndex = -1;

                        // Cerchiamo l'indice in base all'href del file HTML corrente
                        for (let i = 0; i < tocData.length; i++) {
                            if (tocData[i].baseHref && currentHref && (tocData[i].baseHref.includes(currentHref) || currentHref.includes(tocData[i].baseHref))) {
                                activeIndex = i;
                                break;
                            }
                        }

                        // Fallback sulla percentuale se l'href non fa match
                        if (activeIndex === -1 && bookInstance.locations && bookInstance.locations.total > 0) {
                            const pct = bookInstance.locations.percentageFromCfi(currentCfi);
                            activeIndex = tocData.findIndex(c => c.percent > pct) - 1;
                        }

                        if (activeIndex < 0) activeIndex = 0;
                        setCurrentChapterIndex(activeIndex);

                        const currentChap = tocData[activeIndex];
                        setChapterStats(prev => ({ ...prev, title: currentChap?.label || 'Capitolo' }));
                    }

                    if (bookInstance.locations && bookInstance.locations.total > 0) {
                        const currentPercent = bookInstance.locations.percentageFromCfi(currentCfi);
                        const displayPercent = Number((currentPercent * 100).toFixed(1));
                        setBookProgress(displayPercent);
                        updateData.progress = displayPercent;
                    }

                    db.books.update(bookId, updateData);
                });

                await bookInstance.ready;

                // Estrazione Indice Sicura
                const extractToc = async () => {
                    const navigation = await bookInstance.loaded.navigation;
                    let tocData = [];

                    const processItem = (item) => {
                        let safePct = 0;
                        try {
                            // Tentativo 1: usiamo la funzione nativa
                            if (item.href && bookInstance.locations) {
                                const exactPct = bookInstance.locations.percentageFromCfi(item.href);
                                if (exactPct > 0) safePct = exactPct;
                            }

                            // Tentativo 2: PIANO B (questo salverà le tue tacche!)
                            // Se la percentuale è ancora 0, calcoliamo in base all'ordine dei capitoli nel file
                            if (safePct === 0 && item.href) {
                                const hrefBase = item.href.split('#')[0];
                                const spineItem = bookInstance.spine.get(hrefBase);
                                if (spineItem) {
                                    safePct = spineItem.index / bookInstance.spine.length;
                                }
                            }
                        } catch (e) {
                            // Ignoriamo gli errori di parsing
                        }

                        const baseHref = item.href ? item.href.split('#')[0] : '';
                        tocData.push({
                            label: item.label ? item.label.trim() : 'Capitolo',
                            percent: safePct,
                            href: item.href,
                            baseHref: baseHref
                        });

                        if (item.subitems && item.subitems.length > 0) {
                            item.subitems.forEach(processItem);
                        }
                    };

                    navigation.toc.forEach(processItem);

                    if (tocData.length === 0) {
                        tocData.unshift({ label: 'Inizio', percent: 0, href: null, baseHref: '' });
                    }

                    tocRef.current = tocData;
                    setToc(tocData);

                    // Ora i marks verranno generati e salvati correttamente!
                    const marks = tocData
                        .filter(c => c.percent > 0)
                        .map(c => ({ value: Number((c.percent * 100).toFixed(1)) }));

                    setChaptersMarks(marks);
                };

                if (bookData.locations) {
                    bookInstance.locations.load(bookData.locations);
                    await extractToc();
                } else {
                    await bookInstance.locations.generate(1600);
                    if (!isMounted) return;
                    await extractToc();
                    db.books.update(bookId, { locations: bookInstance.locations.save() });
                }
                newRendition.reportLocation();

            } catch (error) { console.error("Errore caricamento libro:", error); }
        };

        loadBook();
        return () => { isMounted = false; if (bookRef.current) bookRef.current.destroy(); };
    }, [bookId]);

    const handleSliderChange = (event, newValue) => setBookProgress(newValue);

    const handleSliderCommitted = async (event, newValue) => {
        if (!renditionRef.current || !bookRef.current) return;
        const cfi = bookRef.current.locations.cfiFromPercentage(newValue / 100);
        if (cfi) await renditionRef.current.display(cfi);
    };

    const goToChapter = async (chapter) => {
        setIsTocOpen(false);
        if (chapter.href) {
            await renditionRef.current.display(chapter.href);
        } else if (chapter.percent > 0) {
            const cfi = bookRef.current.locations.cfiFromPercentage(chapter.percent);
            if (cfi) await renditionRef.current.display(cfi);
        }
    };

    const updateSetting = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: currentTheme.bg, color: currentTheme.text, overflow: 'hidden', transition: 'background-color 0.3s' }}>

            {/* TOP BAR */}
            <AppBar position="static" elevation={0} sx={{ bgcolor: currentTheme.barBg, color: currentTheme.text, borderBottom: `1px solid ${settings.theme === 'dark' ? '#333' : '#eee'}` }}>
                <Toolbar sx={{ px: { xs: 1, sm: 2 } }}>
                    <IconButton edge="start" color="inherit" onClick={onClose}>
                        <ArrowBackIcon />
                    </IconButton>

                    <IconButton color="inherit" onClick={() => setIsTocOpen(true)} sx={{ ml: 1 }}>
                        <FormatListBulletedIcon />
                    </IconButton>

                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', mx: 2, overflow: 'hidden' }}>
                        <Typography variant="body1" noWrap sx={{ fontWeight: 500, fontSize: '0.95rem', width: '100%', textAlign: 'center' }}>
                            {bookTitle}
                        </Typography>
                        <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontSize: '0.7rem', width: '100%', textAlign: 'center' }}>
                            {chapterStats.title}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mr: 1, fontSize: '0.85rem', display: { xs: 'none', sm: 'block' } }}>
                            {time}
                        </Typography>
                        <IconButton color="inherit" onClick={() => setIsSettingsOpen(true)} size="small">
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Toolbar>
            </AppBar>

            {/* VIEWER PRINCIPALE */}
            <Box sx={{ flexGrow: 1, position: 'relative', width: '100%' }}>
                {!isBookReady && (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20, bgcolor: currentTheme.bg }}>
                        <CircularProgress size={40} sx={{ color: PURPLE }} />
                    </Box>
                )}
                <Box ref={viewerRef} sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, px: { xs: 1, sm: 4 }, py: 1 }} />
            </Box>

            {/* BARRA DI AVANZAMENTO (SLIDER) */}
            <Box sx={{ p: 2, bgcolor: currentTheme.barBg }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 600, mx: 'auto' }}>
                    <Slider
                        value={bookProgress}
                        marks={chaptersMarks}
                        step={0.1}
                        onChange={handleSliderChange}
                        onChangeCommitted={handleSliderCommitted}
                        sx={{
                            padding: '13px 0 !important',
                            color: PURPLE,
                            height: 6, // Altezza della barra
                            '& .MuiSlider-thumb': {
                                width: 14,
                                height: 14,
                                '&:focus, &:hover, &.Mui-active, &.Mui-focusVisible': {
                                    boxShadow: `0px 0px 0px 8px ${PURPLE}33`,
                                },
                            },
                            '& .MuiSlider-rail': {
                                bgcolor: settings.theme === 'dark' ? '#333' : '#e0e0e0',
                                opacity: 1
                            },
                            '& .MuiSlider-track': {
                                border: 'none'
                            },
                            // --- STILE TACCHE YOUTUBE ---
                            '& .MuiSlider-mark': {
                                height: 6, // Stessa altezza della barra
                                width: 3,  // Spessore del "taglio" (aumentalo a 4 se lo vuoi più netto)
                                backgroundColor: currentTheme.barBg, // Fonde il segno con lo sfondo
                                opacity: 1,
                            },
                            '& .MuiSlider-markActive': {
                                backgroundColor: currentTheme.barBg, // Mantiene il taglio sulla parte viola
                                opacity: 1,
                            }
                        }}
                    />
                </Box>
            </Box>

            {/* DRAWER INDICE (ToC) */}
            <Drawer anchor="left" open={isTocOpen} onClose={() => setIsTocOpen(false)}>
                <Box sx={{ width: 280, bgcolor: currentTheme.barBg, color: currentTheme.text, height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" sx={{ p: 2, fontWeight: 600, borderBottom: `1px solid ${settings.theme === 'dark' ? '#333' : '#eee'}` }}>
                        Indice
                    </Typography>
                    <List sx={{ flexGrow: 1, overflowY: 'auto', p: 0 }}>
                        {toc.map((chapter, index) => (
                            <ListItem key={index} disablePadding divider>
                                <ListItemButton
                                    id={`toc-item-${index}`} // Serve per l'auto-scroll
                                    onClick={() => goToChapter(chapter)}
                                    sx={{
                                        py: 1.5,
                                        borderLeft: currentChapterIndex === index ? `4px solid ${PURPLE}` : '4px solid transparent',
                                        bgcolor: currentChapterIndex === index ? currentTheme.active : 'transparent',
                                        '&:hover': { bgcolor: currentTheme.active }
                                    }}
                                >
                                    <ListItemText
                                        primary={chapter.label}
                                        primaryTypographyProps={{
                                            fontSize: '0.9rem',
                                            fontWeight: currentChapterIndex === index ? 'bold' : 'normal',
                                            color: currentChapterIndex === index ? PURPLE : currentTheme.text
                                        }}
                                    />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Box>
            </Drawer>

            {/* MODALE IMPOSTAZIONI */}
            <Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Impostazioni</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Tema</Typography>
                        <ToggleButtonGroup value={settings.theme} exclusive onChange={(e, val) => val && updateSetting('theme', val)} fullWidth size="small">
                            <ToggleButton value="light">Chiaro</ToggleButton>
                            <ToggleButton value="sepia">Seppia</ToggleButton>
                            <ToggleButton value="dark">Scuro</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Scorrimento</Typography>
                        <ToggleButtonGroup value={settings.flow} exclusive onChange={(e, val) => val && updateSetting('flow', val)} fullWidth size="small">
                            <ToggleButton value="paginated">Pagine</ToggleButton>
                            <ToggleButton value="scrolled-doc">Continuo</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                    <Divider />
                    <FormControl fullWidth size="small">
                        <InputLabel>Carattere</InputLabel>
                        <Select value={settings.fontFamily} label="Carattere" onChange={(e) => updateSetting('fontFamily', e.target.value)}>
                            <MenuItem value="sans-serif">Sans-serif</MenuItem>
                            <MenuItem value="serif">Serif</MenuItem>
                            <MenuItem value="monospace">Monospace</MenuItem>
                        </Select>
                    </FormControl>
                    <Box>
                        <Typography variant="caption" color="text.secondary">Dimensione Testo ({settings.fontSize}%)</Typography>
                        <Slider value={settings.fontSize} min={50} max={250} step={10} onChange={(e, val) => updateSetting('fontSize', val)} />
                    </Box>
                </DialogContent>
            </Dialog>
        </Box>
    );
}