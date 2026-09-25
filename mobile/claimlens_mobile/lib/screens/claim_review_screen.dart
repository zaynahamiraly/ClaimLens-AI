import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/claim.dart';
import '../providers/claims_provider.dart';
import '../services/api_client.dart';
import 'claim_details_screen.dart';

class ClaimReviewScreen extends StatefulWidget {
  const ClaimReviewScreen({super.key, required this.reference, required this.patientName, required this.providerName, required this.documents, required this.fields});
  final String reference;
  final String patientName;
  final String providerName;
  final List<DocumentConfirmation> documents;
  final List<FieldCorrection> fields;
  @override
  State<ClaimReviewScreen> createState() => _ClaimReviewScreenState();
}

class _ClaimReviewScreenState extends State<ClaimReviewScreen> {
  bool busy = false;
  String? error;

  double get total => widget.documents.where((item) => item.include).fold(0, (sum, item) => sum + (item.amount ?? 0));
  String get currency => widget.documents.firstWhere((item) => item.include).currency;

  Future<void> _submit() async {
    setState(() { busy = true; error = null; });
    try {
      await context.read<ClaimsProvider>().service.confirm(widget.reference, widget.patientName, widget.providerName, widget.documents, widget.fields);
      if (!mounted) return;
      context.read<ClaimsProvider>().loadDashboard();
      Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (_) => ClaimDetailsScreen(reference: widget.reference, submitted: true)), (route) => route.isFirst);
    } catch (exception) {
      if (mounted) setState(() => error = readableApiError(exception));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Review and submit')),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Text(widget.reference, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 16),
          Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [ListTile(contentPadding: EdgeInsets.zero, title: const Text('Patient'), subtitle: Text(widget.patientName)), ListTile(contentPadding: EdgeInsets.zero, title: const Text('Provider'), subtitle: Text(widget.providerName))]))),
          const SizedBox(height: 16),
          ...widget.documents.map((item) => ListTile(leading: Icon(item.include ? Icons.check_circle : Icons.remove_circle_outline, color: item.include ? Colors.green : Colors.grey), title: Text(item.document.originalName), subtitle: Text(item.include ? '${item.currency} ${item.amount!.toStringAsFixed(2)}' : 'Not included in total'))),
          if (widget.fields.isNotEmpty) ...[
            const Divider(height: 24),
            Text('Other extracted information', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            ...widget.fields.map((field) => ListTile(contentPadding: EdgeInsets.zero, title: Text(field.label), subtitle: Text(field.value))),
          ],
          const Divider(height: 32),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('Claim total', style: Theme.of(context).textTheme.titleLarge), Text('$currency ${total.toStringAsFixed(2)}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900))]),
          const SizedBox(height: 12),
          const Text('By submitting, you confirm that these values match your documents. High-confidence consistent claims may be verified automatically; all others go to human review.'),
          if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 20),
          OutlinedButton.icon(onPressed: busy ? null : () => Navigator.pop(context), icon: const Icon(Icons.edit_outlined), label: const Text('Go back and edit')),
          const SizedBox(height: 8),
          TextButton(onPressed: busy ? null : () => Navigator.popUntil(context, (route) => route.isFirst), child: const Text('Cancel for now and keep as draft')),
          const SizedBox(height: 8),
          FilledButton.icon(onPressed: busy ? null : _submit, icon: busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send), label: const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('Confirm and submit claim'))),
        ]),
      );
}
