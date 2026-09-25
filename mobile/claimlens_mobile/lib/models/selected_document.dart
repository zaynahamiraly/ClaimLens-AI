import 'dart:typed_data';

class SelectedDocument {
  const SelectedDocument({required this.name, required this.mimeType, required this.bytes});
  final String name;
  final String mimeType;
  final Uint8List bytes;
}
