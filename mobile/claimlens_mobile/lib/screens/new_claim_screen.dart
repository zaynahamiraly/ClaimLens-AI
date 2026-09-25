import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/selected_document.dart';
import '../providers/claims_provider.dart';
import '../services/api_client.dart';
import 'processing_screen.dart';

class NewClaimScreen extends StatefulWidget {
  const NewClaimScreen({super.key});
  @override
  State<NewClaimScreen> createState() => _NewClaimScreenState();
}

class _NewClaimScreenState extends State<NewClaimScreen> {
  final documents = <SelectedDocument>[];
  final picker = ImagePicker();
  bool busy = false;
  String? error;

  String _mime(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (lower.endsWith('.png')) return 'image/png';
    return 'image/jpeg';
  }

  Future<void> _pickFiles() async {
    final result = await FilePicker.platform.pickFiles(allowMultiple: true, withData: true, type: FileType.custom, allowedExtensions: ['pdf', 'docx', 'png', 'jpg', 'jpeg']);
    if (result == null) return;
    setState(() {
      for (final file in result.files) {
        if (file.bytes != null) documents.add(SelectedDocument(name: file.name, mimeType: _mime(file.name), bytes: file.bytes!));
      }
    });
  }

  Future<void> _pickImages(ImageSource source) async {
    final List<XFile> images;
    if (source == ImageSource.gallery) {
      images = await picker.pickMultiImage(imageQuality: 90);
    } else {
      final image = await picker.pickImage(source: source, imageQuality: 90);
      images = image == null ? [] : [image];
    }
    final selected = <SelectedDocument>[];
    for (final image in images) {
      selected.add(SelectedDocument(name: image.name, mimeType: _mime(image.name), bytes: await image.readAsBytes()));
    }
    setState(() => documents.addAll(selected));
  }

  Future<void> _submit() async {
    if (documents.isEmpty) {
      setState(() => error = 'Add at least one claim document.');
      return;
    }
    if (documents.length > 10) {
      setState(() => error = 'A claim can contain up to 10 documents.');
      return;
    }
    final oversized = documents.where((document) => document.bytes.length > 10 * 1024 * 1024).toList();
    if (oversized.isNotEmpty) {
      setState(() => error = '${oversized.first.name} is larger than 10 MB.');
      return;
    }
    setState(() { busy = true; error = null; });
    try {
      final claim = await context.read<ClaimsProvider>().service.create(documents);
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => ProcessingScreen(reference: claim.reference)));
    } catch (exception) {
      setState(() => error = readableApiError(exception));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('New claim')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Text('Upload every document for this claim', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          const Text('Add invoices, receipts, pharmacy documents, medical certificates, memos, claim forms, or other supporting evidence. OCR will propose values; you will confirm them before submission.'),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(child: OutlinedButton.icon(onPressed: busy ? null : () => _pickImages(ImageSource.camera), icon: const Icon(Icons.camera_alt_outlined), label: const Text('Camera'))),
            const SizedBox(width: 8),
            Expanded(child: OutlinedButton.icon(onPressed: busy ? null : () => _pickImages(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined), label: const Text('Gallery'))),
          ]),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: busy ? null : _pickFiles, icon: const Icon(Icons.attach_file), label: const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('PDF, Word, or image files'))),
          const SizedBox(height: 20),
          Text('${documents.length} document${documents.length == 1 ? '' : 's'} selected', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (documents.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No documents selected yet.'))),
          ...documents.asMap().entries.map((entry) => Card(margin: const EdgeInsets.only(bottom: 8), child: ListTile(leading: const Icon(Icons.description_outlined), title: Text(entry.value.name, maxLines: 2, overflow: TextOverflow.ellipsis), subtitle: Text('${(entry.value.bytes.length / 1024).toStringAsFixed(0)} KB'), trailing: IconButton(onPressed: busy ? null : () => setState(() => documents.removeAt(entry.key)), icon: const Icon(Icons.close))))),
          if (error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 12),
          FilledButton.icon(onPressed: busy ? null : _submit, icon: busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.cloud_upload_outlined), label: const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('Upload and extract'))),
        ]),
      );
}
