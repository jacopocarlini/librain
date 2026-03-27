import 'package:flutter/material.dart';
import 'package:epub_view/epub_view.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'dart:io' as io;

class ReaderPage extends StatefulWidget {
  final PlatformFile epubFile;
  const ReaderPage({Key? key, required this.epubFile}) : super(key: key);

  @override
  State<ReaderPage> createState() => _ReaderPageState();
}

class _ReaderPageState extends State<ReaderPage> {
  late EpubController _epubController;
  bool _isControllerInitialized = false;
  String _currentTime = '';
  Timer? _timer;

  bool _isReady = false;

  // Metadati calcolati dinamicamente
  double _readingProgress = 0.0;
  int _currentChapter = 1;
  int _totalChapters = 1;
  String _estimatedTimeLeft = "Calcolo...";

  List<double> _chapterMarks = [];
  List<int> _chapterWordCounts = [];
  int _totalBookWords = 0;

  // Velocità media di lettura (Parole al minuto)
  final int _wordsPerMinute = 250;

  @override
  void initState() {
    super.initState();
    _startClock();
    _initReader();
  }

  void _startClock() {
    _updateTime();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      _updateTime();
    });
  }

  void _updateTime() {
    setState(() {
      _currentTime = DateFormat('HH:mm').format(DateTime.now());
    });
  }

  Future<Uint8List> _getEpubBytes() async {
    if (kIsWeb) {
      return widget.epubFile.bytes!;
    } else {
      return await io.File(widget.epubFile.path!).readAsBytes();
    }
  }

  Future<void> _initReader() async {
    final prefs = await SharedPreferences.getInstance();
    final savedPosition = prefs.getString('bookmark_${widget.epubFile.name}');

    final Uint8List epubBytes = await _getEpubBytes();

    _epubController = EpubController(
      document: EpubDocument.openData(epubBytes),
      epubCfi: savedPosition,
    );

    setState(() {
      _isControllerInitialized = true;
    });
  }

  Future<void> _saveBookmark() async {
    if (_epubController.generateEpubCfi() != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
          'bookmark_${widget.epubFile.name}',
          _epubController.generateEpubCfi()!
      );
    }
  }

  // ALGORITMO: Analizza l'EPUB per estrarre parole e posizioni
  Future<void> _analyzeBookMetadata(EpubBook document) async {
    int totalWords = 0;
    List<int> wordCounts = [];
    List<double> marks = [];

    // Se l'EPUB ha capitoli formattati correttamente
    if (document.Chapters != null && document.Chapters!.isNotEmpty) {
      for (var chapter in document.Chapters!) {
        // Estraiamo il testo HTML e lo ripuliamo dai tag per contare le parole
        String html = chapter.HtmlContent ?? '';
        String cleanText = html.replaceAll(RegExp(r'<[^>]*>'), ' ');
        int words = cleanText.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).length;

        wordCounts.add(words);
        marks.add(totalWords.toDouble()); // Registriamo il punto di inizio del capitolo
        totalWords += words;
      }

      // Trasformiamo i conteggi in percentuali per le tacche (es: 0.0, 0.15, 0.40)
      if (totalWords > 0) {
        marks = marks.map((m) => m / totalWords).toList();
      }
    }

    setState(() {
      _totalBookWords = totalWords;
      _chapterWordCounts = wordCounts;
      _chapterMarks = marks;
      _totalChapters = document.Chapters?.length ?? 1;
      _isReady = true;

      _updateProgressAndEstimations(_currentChapter);
    });
  }

  // ALGORITMO: Aggiorna la barra e il tempo stimato quando cambi capitolo
  void _updateProgressAndEstimations(int chapterNumber) {
    int index = chapterNumber - 1; // Gli array partono da 0

    if (index >= 0 && index < _chapterWordCounts.length) {
      // 1. Calcola il tempo stimato per QUESTO capitolo
      int chapterWords = _chapterWordCounts[index];
      int minutesLeft = (chapterWords / _wordsPerMinute).ceil();
      _estimatedTimeLeft = minutesLeft < 1 ? "< 1 min" : "$minutesLeft min";

      // 2. Aggiorna la percentuale reale del libro letto (fino all'inizio del capitolo)
      if (_totalBookWords > 0 && index < _chapterMarks.length) {
        _readingProgress = _chapterMarks[index];
      }
    } else {
      // Fallback nel caso l'EPUB non abbia indici validi
      _estimatedTimeLeft = "N/D";
      _readingProgress = _totalChapters > 0 ? chapterNumber / _totalChapters : 0.0;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            // --- TOP BAR: Orario e Tasto Indietro ---
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: IconButton(
                      icon: const Icon(Icons.arrow_back, color: Colors.black54),
                      onPressed: () {
                        _saveBookmark();
                        Navigator.pop(context);
                      },
                    ),
                  ),
                  Text(
                      _currentTime,
                      style: const TextStyle(fontSize: 14, color: Colors.black54, fontWeight: FontWeight.bold)
                  ),
                ],
              ),
            ),

            // --- AREA DI LETTURA ---
            Expanded(
              child: _isControllerInitialized
                  ? EpubView(
                controller: _epubController,
                onDocumentLoaded: (document) {
                  // Avvia l'analisi profonda del libro in background
                  _analyzeBookMetadata(document);
                },
                onChapterChanged: (chapter) {
                  if (chapter != null) {
                    setState(() {
                      _currentChapter = chapter.chapterNumber;
                      if (_isReady) {
                        _updateProgressAndEstimations(_currentChapter);
                      }
                    });
                    _saveBookmark();
                  }
                },
              )
                  : const Center(
                child: CircularProgressIndicator(color: Colors.black),
              ),
            ),

            // --- BOTTOM BAR: Progressi e Info Testuali ---
            Container(
              color: Colors.white,
              padding: const EdgeInsets.only(bottom: 16.0, top: 8.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildProgressBar(),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // Percentuale matematica esatta
                        Text('${(_readingProgress * 100).toStringAsFixed(1)}%',
                            style: const TextStyle(fontSize: 13, color: Colors.black87, fontWeight: FontWeight.bold)),

                        // Numero capitolo
                        Text(_isReady ? 'Cap. $_currentChapter di $_totalChapters' : 'Analisi in corso...',
                            style: const TextStyle(fontSize: 13, color: Colors.black87)),

                        // Tempo stimato
                        Text('Fine cap: $_estimatedTimeLeft',
                            style: const TextStyle(fontSize: 13, color: Colors.black87)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProgressBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      child: LayoutBuilder(
          builder: (context, constraints) {
            return SizedBox(
              height: 12,
              width: constraints.maxWidth,
              child: Stack(
                alignment: Alignment.centerLeft,
                children: [
                  SizedBox(
                    width: constraints.maxWidth,
                    child: LinearProgressIndicator(
                      value: _readingProgress,
                      backgroundColor: Colors.grey[200],
                      color: Colors.black87,
                      minHeight: 4,
                    ),
                  ),
                  // Le tacche ora sono popolate dinamicamente dalla lunghezza dei capitoli!
                  ..._chapterMarks.map((mark) {
                    return Positioned(
                      left: constraints.maxWidth * mark,
                      child: Container(
                        width: 2,
                        height: 12,
                        color: Colors.black54,
                      ),
                    );
                  }).toList(),
                ],
              ),
            );
          }
      ),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _saveBookmark();
    _epubController.dispose();
    super.dispose();
  }
}