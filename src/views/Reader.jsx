import React, {useEffect, useRef, useState} from 'react';
import {db} from '../services/db';
import {epubService} from '../services/EpubService';
import {
    AppBar,
    Box,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Slider,
    Toolbar,
    Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import {SettingsDrawer} from './Settings';
import CloseIcon from '@mui/icons-material/Close';

export default function Reader({bookId, onClose, settings, setSettings, themeStyles}) {
    const viewerRef = useRef(null);

    // Stati UI e Info Libro
    const [bookTitle, setBookTitle] = useState('Caricamento...');
    const [time, setTime] = useState(new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}));
    const [isBookReady, setIsBookReady] = useState(false);

    // Stati Navigazione e Progresso
    const [bookProgress, setBookProgress] = useState(0);
    const [chapterStats, setChapterStats] = useState({title: '', timeLeft: '-- min'});
    const [toc, setToc] = useState([]);
    const [chaptersMarks, setChaptersMarks] = useState([]);
    const [currentChapterIndex, setCurrentChapterIndex] = useState(-1);

    // Menu
    const [isTocOpen, setIsTocOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Aggiornamento Orologio
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date().toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit'
        })), 10000);
        return () => clearInterval(timer);
    }, []);

    // Inizializzazione del Libro
// Dentro Reader.js, nell'useEffect di inizializzazione:

    useEffect(() => {
        let isMounted = true;

        const loadBook = async () => {
            const bookData = await db.books.get(bookId);
            if (!bookData || !isMounted) return;

            setBookTitle(bookData.title || 'Titolo Sconosciuto');
            setToc(bookData.toc || []);

            // Passiamo direttamente il riferimento al DOM
            await epubService.init({
                bookData,
                elementId: viewerRef.current, // Passa il nodo DOM direttamente
                settings: settings,
                onReady: () => {
                    if (!isMounted) return;
                    setIsBookReady(true);
                    setChaptersMarks(epubService.getChapterMarks());

                    // Evento tastiera dentro l'iframe
                    epubService.rendition.on('keydown', (e) => {
                        if (e.key === 'ArrowLeft') epubService.prev();
                        if (e.key === 'ArrowRight') epubService.next();
                    });
                },
                onRelocated: (data) => {
                    if (!isMounted) return;
                    setChapterStats({title: data.chapterTitle, timeLeft: data.timeLeft});
                    setCurrentChapterIndex(data.chapterIndex);
                    setBookProgress(data.percentage);
                    db.books.update(bookId, {currentCfi: data.cfi, progress: data.percentage});
                }
            });
        };

        loadBook();

        return () => {
            isMounted = false;
            // La distruzione è gestita dal service
            epubService.destroy();
        };
    }, [bookId, settings]); // Riesegue quando cambia la modalità
    // Applica settings dinamici (font, temi, etc)


    useEffect(() => {
        if (isBookReady && epubService) {
            epubService.applySettings(settings);
        }
    }, [settings, isBookReady]);

    // Tastiera finestra principale
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            if (event.key === 'ArrowLeft') epubService.prev();
            if (event.key === 'ArrowRight') epubService.next();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleMarginClick = (e) => {
        if (window.getSelection().toString().length > 0) return;
        const containerRect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - containerRect.left;
        if (clickX < containerRect.width * 0.25) epubService.prev();
        else if (clickX > containerRect.width * 0.75) epubService.next();
    };

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100dvh',
            bgcolor: themeStyles.bg,
            color: themeStyles.text,
            overflow: 'hidden',
            transition: 'background-color 0.3s ease'
        }}>

            {/* HEADER */}
            <AppBar position="static" elevation={0} sx={{
                bgcolor: themeStyles.card,
                color: themeStyles.text,
                borderBottom: `1px solid ${themeStyles.border}`,
                backgroundImage: 'none'
            }}>
                <Toolbar>
                    <IconButton edge="start" color="inherit" onClick={onClose}><ArrowBackIcon/></IconButton>
                    <IconButton color="inherit"
                                onClick={() => setIsTocOpen(true)}><FormatListBulletedIcon/></IconButton>

                    <Box sx={{flexGrow: 1, textAlign: 'center', px: 2}}>
                        <Typography variant="body1" noWrap sx={{fontWeight: 600}}>{bookTitle}</Typography>
                        <Typography variant="caption" noWrap
                                    sx={{display: 'block', opacity: 0.7, color: themeStyles.secondaryText}}>
                            {chapterStats.title || 'Caricamento...'}
                        </Typography>
                    </Box>

                    <Typography variant="body2"
                                sx={{mr: 1, fontWeight: 500, opacity: 0.8, display: {xs: 'none', sm: 'block'}}}>
                        {time}
                    </Typography>

                    <IconButton color="inherit" onClick={() => setSettingsOpen(true)}><SettingsIcon/></IconButton>
                </Toolbar>
            </AppBar>


            {/* AREA LETTURA */}
            <Box
                sx={{
                    flexGrow: 1,
                    position: 'relative',
                    overflow: 'hidden',
                    px: { xs: 1, sm: 1 }, // <-- Spostiamo il padding sul contenitore padre
                    boxSizing: 'border-box', // <-- Evita che il padding sfondi la larghezza dello schermo
                }}
                onClick={handleMarginClick}
            >
                <Box
                    ref={viewerRef}
                    sx={{
                        height: '100%',
                        width: '100%',
                        // Padding rimosso da qui
                        '& .epub-container': {
                            height: '100% !important',
                            minWidth: '100% !important',
                        }
                    }}
                />
            </Box>

            {/* FOOTER */}
            <Box sx={{p: 2, bgcolor: themeStyles.card, borderTop: `1px solid ${themeStyles.border}`}}>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    maxWidth: 1200, // Puoi regolarlo o toglierlo per full-width
                    mx: 'auto'
                }}>

                    {/* SEZIONE SINISTRA: Pulsante centrato in questo spazio */}
                    <Box sx={{flex: 1, display: 'flex', justifyContent: 'center'}}>
                        <IconButton
                            onClick={() => epubService.prev()}
                            sx={{
                                color: themeStyles.text,
                                border: `1px solid ${themeStyles.border}`,
                                borderRadius: '10px',
                                width: 48,
                                height: 48,
                                '&:hover': {bgcolor: 'rgba(0,0,0,0.04)'}
                            }}
                        >
                            <NavigateBeforeIcon/>
                        </IconButton>
                    </Box>

                    {/* SEZIONE CENTRALE: La barra e le info */}
                    <Box sx={{flex: 4, display: 'flex', flexDirection: 'column', gap: 0.5}}>
                        <Slider
                            value={bookProgress}
                            marks={chaptersMarks}
                            step={0.1}
                            onChange={(e, v) => setBookProgress(v)}
                            onChangeCommitted={(e, v) => {
                                epubService.goToPercentage(v);
                                if (document.activeElement) document.activeElement.blur();
                            }}
                            sx={{
                                color: themeStyles.primary,
                                height: 6,
                                '& .MuiSlider-mark': {height: 6, width: 2, bgcolor: themeStyles.bg},
                                '& .MuiSlider-thumb': {width: 14, height: 14}
                            }}
                        />
                        <Box sx={{display: 'flex', justifyContent: 'space-between', px: 0.5}}>
                            <Typography variant="caption" sx={{color: themeStyles.secondaryText, fontWeight: 500}}>
                                {chapterStats.timeLeft}
                            </Typography>
                            <Typography variant="caption" sx={{fontWeight: 'bold', color: themeStyles.secondaryText}}>
                                {bookProgress.toFixed(1)}%
                            </Typography>
                        </Box>
                    </Box>

                    {/* SEZIONE DESTRA: Pulsante centrato in questo spazio */}
                    <Box sx={{flex: 1, display: 'flex', justifyContent: 'center'}}>
                        <IconButton
                            onClick={() => epubService.next()}
                            sx={{
                                color: themeStyles.text,
                                border: `1px solid ${themeStyles.border}`,
                                borderRadius: '10px',
                                width: 48,
                                height: 48,
                                '&:hover': {bgcolor: 'rgba(0,0,0,0.04)'}
                            }}
                        >
                            <NavigateNextIcon/>
                        </IconButton>
                    </Box>

                </Box>
            </Box>

            {/* DRAWER INDICE */}
            <Drawer
                anchor="left"
                open={isTocOpen}
                onClose={() => setIsTocOpen(false)}
                PaperProps={{
                    sx: {
                        // 85% dello schermo su mobile per lasciare l'area cliccabile a destra
                        width: { xs: '85vw', sm: 360 },
                        maxWidth: 360,
                        boxSizing: 'border-box', // Fondamentale per i calcoli di larghezza
                        bgcolor: themeStyles.card,
                        color: themeStyles.text,
                        // Manteniamo gli angoli arrotondati a destra anche su mobile
                        borderRadius: '0 16px 16px 0',
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: '100dvh'
                    },
                }}
            >
                <Box sx={{
                    p: { xs: 2, sm: 3 },
                    borderBottom: `1px solid ${themeStyles.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
                        Indice
                    </Typography>
                    <IconButton onClick={() => setIsTocOpen(false)} size="small" sx={{ color: themeStyles.text, opacity: 0.5 }}>
                        <CloseIcon />
                    </IconButton>
                </Box>

                {/* LISTA SCROLLABILE */}
                <Box sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    pb: 2
                }}>
                    <List sx={{ p: 0 }}>
                        {toc.map((chap, i) => (
                            <ListItem key={i} disablePadding divider sx={{borderColor: themeStyles.border}}>
                                <ListItemButton
                                    onClick={() => {
                                        setIsTocOpen(false);
                                        epubService.goToChapterByIndex(i);
                                    }}
                                    selected={currentChapterIndex === i}
                                    sx={{
                                        pl: 2 + (chap.level || 0) * 3,
                                        ...(chap.level > 0 && currentChapterIndex === i && {
                                            bgcolor: 'rgba(0,0,0,0.03)'
                                        })
                                    }}
                                >
                                    {chap.level > 0 && (
                                        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: themeStyles.text, opacity: 0.3, mr: 1.5 }} />
                                    )}

                                    <ListItemText
                                        primary={chap.label}
                                        primaryTypographyProps={{
                                            fontWeight: currentChapterIndex === i ? 600 : 400,
                                            color: currentChapterIndex === i ? themeStyles.primary : 'inherit',
                                            fontSize: chap.level > 0 ? '0.9rem' : '1rem',
                                            opacity: chap.level > 0 && currentChapterIndex !== i ? 0.8 : 1
                                        }}
                                    />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Box>
            </Drawer>

            {/* COMPONENTE SETTINGS ESTERNO */}
            <SettingsDrawer
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                settings={settings}
                setSettings={setSettings}
                themeStyles={themeStyles}
            />
        </Box>
    );
}