import React, { useState, useEffect, useMemo } from 'react';
import {
    AppBar, Toolbar, Typography, Button, Box, Container,
    Menu, MenuItem, CircularProgress, Backdrop, Tabs, Tab, IconButton, InputBase
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SearchIcon from '@mui/icons-material/Search';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add'; // <-- Nuovo import necessario
import { db } from '../services/db';
import { processEpubFile } from '../services/epubService';
import { BookCard } from './BookCard';
import { SettingsDrawer } from './Settings';

export default function Home({ onOpenBook, settings, setSettings, themeStyles }) {
    const [books, setBooks] = useState([]);
    const [isImporting, setIsImporting] = useState(false);
    const [tabValue, setTabValue] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);

    const [menuState, setMenuState] = useState({ anchor: null, bookId: null });

    useEffect(() => {
        db.books.toArray().then(setBooks);
    }, []);

    const filteredBooks = useMemo(() => {
        return books.filter(book => {
            const matchesSearch =
                book.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                book.author?.toLowerCase().includes(searchQuery.toLowerCase());
            let matchesTab = true;
            if (tabValue === 1) matchesTab = (book.progress || 0) < 98;
            if (tabValue === 2) matchesTab = (book.progress || 0) >= 98;
            return matchesSearch && matchesTab;
        });
    }, [books, searchQuery, tabValue]);

    const handleImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        setIsImporting(true);
        try {
            const processedBook = await processEpubFile(file);
            const id = await db.books.add(processedBook);
            setBooks(prev => [...prev, { ...processedBook, id }]);
        } catch (error) {
            alert("Errore nell'importazione");
        } finally {
            setIsImporting(false);
            event.target.value = '';
        }
    };

    const handleDelete = async () => {
        if (window.confirm("Eliminare definitivamente questo libro?")) {
            await db.books.delete(menuState.bookId);
            setBooks(prev => prev.filter(b => b.id !== menuState.bookId));
        }
        setMenuState({ anchor: null, bookId: null });
    };

    return (
        <Box sx={{
            height: '100svh',
            bgcolor: themeStyles.bg,
            color: themeStyles.text,
            transition: 'background-color 0.3s ease',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <SettingsDrawer
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                settings={settings}
                setSettings={setSettings}
                themeStyles={themeStyles}
            />

            <AppBar position="static" elevation={0} sx={{ bgcolor: 'transparent', py: { xs: 1, sm: 2 } }}>
                <Toolbar sx={{ px: { xs: 2, sm: 6 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>

                    {/* LOGO AREA - Responsive flex */}
                    <Box sx={{ display: 'flex', alignItems: 'center', flex: { xs: 1, md: 'none' }, minWidth: { md: '150px' } }}>
                        <img src="/gembook/icon.png" alt="Logo" style={{ width: 35, height: 35 }} />
                        <Typography variant="h6" sx={{ color: themeStyles.text, fontWeight: 800, ml: 1.5, display: { xs: 'block', sm: 'block' } }}>
                            GemBook
                        </Typography>
                    </Box>

                    {/* CENTER ACTIONS (Search Desktop + Add Book) */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, flexGrow: { md: 1 }, justifyContent: { xs: 'flex-end', md: 'center' } }}>

                        {/* Search Desktop */}
                        <Box sx={{
                            display: { xs: 'none', md: 'flex' },
                            bgcolor: themeStyles.card,
                            borderRadius: '12px', px: 2, py: 0.5,
                            width: '100%', maxWidth: 350,
                            border: `1px solid ${themeStyles.border}`,
                            alignItems: 'center'
                        }}>
                            <SearchIcon sx={{ color: 'grey.400', fontSize: 20, mr: 1 }} />
                            <InputBase
                                placeholder="Search books..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                sx={{ flex: 1, fontSize: '0.9rem', color: themeStyles.text }}
                            />
                        </Box>

                        {/* Add Book Button - Icona su Mobile, Testo su Desktop */}
                        <Button
                            component="label"
                            variant="contained"
                            disableElevation
                            sx={{
                                bgcolor: themeStyles.primary,
                                borderRadius: '12px',
                                textTransform: 'none',
                                px: { xs: 1.5, sm: 3 },
                                minWidth: { xs: 'auto', sm: '120px' },
                                fontWeight: 'bold'
                            }}
                        >
                            <AddIcon sx={{ display: { xs: 'block', sm: 'block' } }} />
                            <Box sx={{ display: { xs: 'block', sm: 'block' } }}>Add Book</Box>
                            <input type="file" accept=".epub" hidden onChange={handleImport} />
                        </Button>
                    </Box>

                    {/* SETTINGS */}
                    <Box sx={{ minWidth: { md: '150px' }, display: 'flex', justifyContent: 'flex-end' }}>
                        <IconButton onClick={() => setSettingsOpen(true)} sx={{ color: themeStyles.text, bgcolor: themeStyles.card }}>
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Toolbar>
            </AppBar>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', mt: { xs: 1, sm: 2 } }}>
                <Container maxWidth="md">

                    {/* Search Mobile - Visibile solo su schermi piccoli */}
                    <Box sx={{
                        display: { xs: 'flex', md: 'none' },
                        bgcolor: themeStyles.card,
                        borderRadius: '12px', px: 2, py: 0.5, mb: 3,
                        border: `1px solid ${themeStyles.border}`,
                        alignItems: 'center'
                    }}>
                        <SearchIcon sx={{ color: 'grey.400', fontSize: 20, mr: 1 }} />
                        <InputBase
                            placeholder="Search books..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            sx={{ flex: 1, fontSize: '0.9rem', color: themeStyles.text }}
                        />
                    </Box>

                    {/* TABS - Rese scrollabili */}
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: { xs: 4, sm: 6 } }}>
                        <Tabs
                            value={tabValue}
                            onChange={(e, v) => setTabValue(v)}
                            variant="scrollable"
                            scrollButtons="auto"
                            allowScrollButtonsMobile
                            sx={{
                                bgcolor: themeStyles.paper,
                                borderRadius: '16px', p: 0.8, minHeight: 'auto',
                                '& .MuiTabs-indicator': { display: 'none' }
                            }}
                        >
                            {['All Books', 'To Read', 'Finished'].map((label) => (
                                <Tab
                                    key={label}
                                    label={label}
                                    sx={{
                                        borderRadius: '12px', textTransform: 'none', fontWeight: 'bold',
                                        minWidth: { xs: 'auto', sm: 120 },
                                        color: 'grey.500',
                                        '&.Mui-selected': { bgcolor: themeStyles.card, color: themeStyles.text }
                                    }}
                                />
                            ))}
                        </Tabs>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {filteredBooks.length > 0 ? (
                            filteredBooks.map(book => (
                                <BookCard
                                    key={book.id}
                                    book={book}
                                    themeStyles={themeStyles}
                                    onOpen={onOpenBook}
                                    onMenuOpen={(e, id) => setMenuState({ anchor: e.currentTarget, bookId: id })}
                                />
                            ))
                        ) : (
                            <Box sx={{
                                textAlign: 'center',
                                py: { xs: 6, md: 10 },
                                px: 2,
                                bgcolor: themeStyles.card,
                                borderRadius: '16px',
                                border: `1px dashed ${themeStyles.border}`,
                                mt: 2
                            }}>
                                <Typography variant="h6" sx={{ color: themeStyles.text, fontWeight: 'bold', mb: 1 }}>
                                    {books.length === 0 ? "La tua libreria è vuota" : "Nessun libro trovato"}
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'grey.500', maxWidth: '300px', mx: 'auto' }}>
                                    {books.length === 0
                                        ? "Tocca il pulsante '+ Add Book' in alto per importare il tuo primo file .epub."
                                        : "Prova a cambiare i termini di ricerca o la tab selezionata per trovare il tuo libro."}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Container>
            </Box>

            <Menu
                anchorEl={menuState.anchor}
                open={Boolean(menuState.anchor)}
                onClose={() => setMenuState({ anchor: null, bookId: null })}
                PaperProps={{
                    sx: {
                        bgcolor: themeStyles.card,
                        color: themeStyles.text,
                        borderRadius: '12px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        border: `1px solid ${themeStyles.border}`
                    }
                }}
            >
                <MenuItem onClick={handleDelete} sx={{ color: 'error.main', fontWeight: 'bold', fontSize: '0.9rem', px: 3 }}>
                    Elimina libro
                </MenuItem>
            </Menu>

            <Backdrop sx={{ color: '#fff', zIndex: 2000, flexDirection: 'column', gap: 2 }} open={isImporting}>
                <CircularProgress color="inherit" />
                <Typography>Analisi in corso...</Typography>
            </Backdrop>
        </Box>
    );
}