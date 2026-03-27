import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart'; // Aggiunto per il salvataggio
import 'package:flutter/foundation.dart'; // Per kIsWeb

import 'reader_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({Key? key}) : super(key: key);

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<PlatformFile> _importedBooks = [];

  @override
  void initState() {
    super.initState();
    _loadBooks(); // Carica i libri salvati all'avvio
  }

  // 1. CARICA I LIBRI SALVATI
  Future<void> _loadBooks() async {
    final prefs = await SharedPreferences.getInstance();
    final List<String>? savedPaths = prefs.getStringList('saved_books');

    if (savedPaths != null && savedPaths.isNotEmpty) {
      setState(() {
        _importedBooks = savedPaths.map((path) {
          // Estrapoliamo il nome del file dal percorso per mostrarlo nella lista
          final name = path.split(RegExp(r'[/\\]')).last;
          // Ricreiamo un oggetto PlatformFile fittizio con il percorso salvato
          return PlatformFile(name: name, size: 0, path: path);
        }).toList();
      });
    }
  }

  // 2. SALVA I LIBRI IN MEMORIA
  Future<void> _saveBooks() async {
    final prefs = await SharedPreferences.getInstance();
    // Estraiamo solo i percorsi non nulli (il Web non ha percorsi, quindi non salverà nulla qui)
    final paths = _importedBooks.where((f) => f.path != null).map((f) => f.path!).toList();
    await prefs.setStringList('saved_books', paths);
  }

  Future<void> _importEpub() async {
    FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['epub'],
      withData: true,
    );

    if (result != null) {
      setState(() {
        _importedBooks.add(result.files.single);
      });

      // Salviamo la lista aggiornata ogni volta che aggiungiamo un libro
      if (!kIsWeb) {
        _saveBooks();
      } else {
        // Avviso specifico per la versione Web
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Nota: Sul Web i file non rimangono salvati al riavvio.')),
        );
      }
    }
  }

  void _openBook(PlatformFile book) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ReaderPage(epubFile: book),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('La mia Libreria'),
      ),
      body: _importedBooks.isEmpty
          ? const Center(
        child: Text(
          'Nessun libro importato.\nTocca "+" per caricare un file EPUB.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey, fontSize: 16),
        ),
      )
          : ListView.builder(
        itemCount: _importedBooks.length,
        itemBuilder: (context, index) {
          final file = _importedBooks[index];
          return Card(
            margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            elevation: 0,
            color: Colors.grey[100],
            child: ListTile(
              leading: const Icon(Icons.menu_book, size: 40, color: Colors.black54),
              title: Text(file.name, style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: const Text('EPUB Document'),
              onTap: () => _openBook(file),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _importEpub,
        backgroundColor: Colors.black87,
        foregroundColor: Colors.white,
        child: const Icon(Icons.add),
      ),
    );
  }
}