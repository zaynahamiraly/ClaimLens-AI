import 'package:flutter/material.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'VERIFIED' => Colors.green,
      'REVIEW_REQUIRED' => Colors.orange,
      'PROCESSING_FAILED' => Colors.red,
      'PROCESSING' => Colors.blue,
      _ => Colors.blueGrey,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: color.withValues(alpha: .12), borderRadius: BorderRadius.circular(99)),
      child: Text(status.replaceAll('_', ' '), style: TextStyle(color: color.shade700, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}
