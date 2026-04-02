import React, {useEffect, useRef, useState} from 'react';
import {db} from '../services/db';
import {epubService} from '../services/EpubService';
import {
    AppBar,
    Box,
    Dialog,
    DialogContent,
    DialogTitle,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Slider,
    ToggleButton,
    ToggleButtonGroup,
    Toolbar,
    Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

const PURPLE = '#5e35b1';

export default function Reader({bookId, onClose}) {
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

    // Menu e Impostazioni
    const [isTocOpen, setIsTocOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState({
        fontSize: 100, fontFamily: 'serif', theme: 'light', flow: 'paginated'
    });

    const themeColors = {
        light: {bg: '#ffffff', text: '#000000', barBg: '#ffffff'},
        dark: {bg: '#121212', text: '#e0e0e0', barBg: '#121212'},
        sepia: {bg: '#f4ecd8', text: '#5b4636', barBg: '#f4ecd8'}
    };
    const currentTheme = themeColors[settings.theme];

    // Aggiornamento Orologio
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        })), 10000);
        return () => clearInterval(timer);
    }, []);

    // Inizializzazione del Libro tramite Service
    useEffect(() => {
        let isMounted = true;

        const loadBook = async () => {
            const bookData = await db.books.get(bookId);
            if (!bookData || !isMounted) return;

            setBookTitle(bookData.title);
            if (bookData.toc) {
                setToc(bookData.toc);
                // RIMOSSA LA LOGICA DEI MARKS DA QUI
            }

            await epubService.init({
                bookData,
                elementId: viewerRef.current,
                settings: settings,
                onReady: () => {
                    if (!isMounted) return;
                    setIsBookReady(true);

                    // Aggiungi i marks richiamandoli dal service una volta pronto!
                    setChaptersMarks(epubService.getChapterMarks());
                },
                onRelocated: (data) => {
                    if (!isMounted) return;
                    setChapterStats({title: data.chapterTitle, timeLeft: data.timeLeft});
                    setCurrentChapterIndex(data.chapterIndex);
                    setBookProgress(data.percentage);
                    db.books.update(bookId, {currentCfi: data.cfi, progress: data.percentage}).catch(console.error);
                }
            });
        };

        loadBook();
        return () => {
            isMounted = false;
            epubService.destroy();
        };
    }, [bookId]); // Assicurati di non avere `settings` come dipendenza per non reinizializzare tutto a ogni cambio

    const updateSetting = (key, value) => {
        const newSettings = {...settings, [key]: value};
        setSettings(newSettings);
        epubService.applySettings(newSettings);
    };

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            bgcolor: currentTheme.bg,
            color: currentTheme.text,
            overflow: 'hidden'
        }}>

            {/* --- BARRA IN ALTO (AppBar) --- */}
            <AppBar position="static" elevation={0} sx={{
                bgcolor: currentTheme.barBg,
                color: currentTheme.text,
                borderBottom: '1px solid rgba(0,0,0,0.1)'
            }}>
                <Toolbar>
                    <IconButton edge="start" color="inherit" onClick={onClose}><ArrowBackIcon/></IconButton>
                    <IconButton color="inherit"
                                onClick={() => setIsTocOpen(true)}><FormatListBulletedIcon/></IconButton>

                    <Box sx={{flexGrow: 1, textAlign: 'center', px: 2}}>
                        <Typography variant="body1" noWrap sx={{fontWeight: 600}}>{bookTitle}</Typography>
                        <Typography variant="caption" noWrap sx={{display: 'block', opacity: 0.7}}>
                            {chapterStats.title || 'Caricamento...'}
                        </Typography>
                    </Box>

                    <Typography variant="body2"
                                sx={{mr: 1, fontWeight: 500, opacity: 0.8, display: {xs: 'none', sm: 'block'}}}>
                        {time}
                    </Typography>

                    <IconButton color="inherit" onClick={() => setIsSettingsOpen(true)}><SettingsIcon/></IconButton>
                </Toolbar>
            </AppBar>

            <Box sx={{flexGrow: 1, position: 'relative'}}>
                <Box ref={viewerRef} sx={{height: '100%', px: {xs: 1, sm: 4}}}/>
            </Box>

            {/* FOOTER (Progress Bar) */}
            <Box sx={{p: 2, bgcolor: currentTheme.barBg, borderTop: '1px solid rgba(0,0,0,0.05)'}}>
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2, maxWidth: 900, mx: 'auto'}}>

                    {/* Pulsante Precedente (Sinistra) */}
                    <IconButton
                        onClick={() => epubService.prev()}
                        sx={{
                            position: 'absolute',
                            left: {xs: 2, sm: 16},
                            zIndex: 10,
                            bgcolor: currentTheme.barBg,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            '&:hover': {bgcolor: currentTheme.barBg, opacity: 0.9}
                        }}
                    >
                        <NavigateBeforeIcon/>
                    </IconButton>


                    <Typography variant="caption" sx={{minWidth: 60,  color: currentTheme.text,}}>
                        {chapterStats.timeLeft} per fine cap.
                    </Typography>

                    <Slider
                        value={bookProgress}
                        marks={chaptersMarks}
                        step={0.1}
                        onChange={(e, v) => setBookProgress(v)}
                        onChangeCommitted={(e, v) => epubService.goToPercentage(v)}
                        sx={{
                            flexGrow: 1,
                            color: PURPLE,
                            '& .MuiSlider-mark': {height: 6, width: 2, bgcolor: currentTheme.barBg},
                            '& .MuiSlider-thumb': {width: 14, height: 14}
                        }}
                    />

                    <Typography variant="caption" sx={{minWidth: 50, fontWeight: 'bold', color: PURPLE}}>
                        {bookProgress.toFixed(1)}%
                    </Typography>

                    {/* Pulsante Successivo (Destra) */}
                    <IconButton
                        onClick={() => epubService.next()}
                        sx={{
                            position: 'absolute',
                            right: {xs: 2, sm: 16},
                            zIndex: 10,
                            bgcolor: currentTheme.barBg,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            '&:hover': {bgcolor: currentTheme.barBg, opacity: 0.9}
                        }}
                    >
                        <NavigateNextIcon/>
                    </IconButton>
                </Box>
            </Box>

            {/* DRAWER INDICE (TOC) */}
            <Drawer anchor="left" open={isTocOpen} onClose={() => setIsTocOpen(false)}>
                <Box sx={{
                    width: 280,
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: currentTheme.bg,
                    color: currentTheme.text,
                    height: '100%'
                }}>
                    <Typography variant="h6" sx={{p: 2, borderBottom: '1px solid rgba(0,0,0,0.1)'}}>
                        Indice
                    </Typography>

                    <List sx={{flexGrow: 1, overflowY: 'auto', p: 0}}>
                        {toc.length > 0 ? (
                            toc.map((chap, i) => (
                                <ListItem key={i} disablePadding divider>
                                    <ListItemButton
                                        onClick={() => {
                                            setIsTocOpen(false);
                                            // Usa il nuovo metodo del service
                                            epubService.goToChapterByIndex(i);
                                        }}
                                        selected={currentChapterIndex === i}
                                    >
                                        <ListItemText
                                            primary={chap.label}
                                            primaryTypographyProps={{
                                                fontSize: '0.9rem',
                                                fontWeight: currentChapterIndex === i ? 600 : 400,
                                                color: currentChapterIndex === i ? PURPLE : 'inherit'
                                            }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))
                        ) : (
                            <Typography variant="body2" sx={{p: 3, textAlign: 'center', opacity: 0.6}}>
                                Nessun indice disponibile.
                            </Typography>
                        )}
                    </List>
                </Box>
            </Drawer>

            {/* Modal Impostazioni */}
            <Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>Personalizzazione</DialogTitle>
                <DialogContent sx={{display: 'flex', flexDirection: 'column', gap: 3, mt: 1}}>
                    {/*<Box>*/}
                    {/*    <Typography variant="caption">Carattere</Typography>*/}
                    {/*    <FormControl fullWidth size="small">*/}
                    {/*        <Select value={settings.fontFamily}*/}
                    {/*                onChange={(e) => updateSetting('fontFamily', e.target.value)}>*/}
                    {/*            {AVAILABLE_FONTS.map(f => (*/}
                    {/*                <MenuItem key={f.value} value={f.value}*/}
                    {/*                          sx={{fontFamily: f.value}}>{f.label}</MenuItem>*/}
                    {/*            ))}*/}
                    {/*        </Select>*/}
                    {/*    </FormControl>*/}
                    {/*</Box>*/}

                    <Box>
                        <Typography variant="caption">Dimensione Testo ({settings.fontSize}%)</Typography>
                        <Slider value={settings.fontSize} min={60} max={200} step={10}
                                onChange={(e, v) => updateSetting('fontSize', v)}/>
                    </Box>

                    <Box>
                        <Typography variant="caption">Tema</Typography>
                        <ToggleButtonGroup value={settings.theme} exclusive fullWidth
                                           onChange={(e, v) => v && updateSetting('theme', v)}>
                            <ToggleButton value="light">Chiaro</ToggleButton>
                            <ToggleButton value="sepia">Seppia</ToggleButton>
                            <ToggleButton value="dark">Scuro</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    <Box>
                        <Typography variant="caption">Modalità di lettura</Typography>
                        <ToggleButtonGroup value={settings.flow} exclusive fullWidth
                                           onChange={(e, v) => v && updateSetting('flow', v)}>
                            <ToggleButton value="paginated">Pagine</ToggleButton>
                            <ToggleButton value="scrolled-doc">Continuo</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                </DialogContent>
            </Dialog>
        </Box>
    );
}