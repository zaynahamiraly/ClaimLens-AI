import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/claim.dart';
import '../providers/auth_provider.dart';
import '../providers/claims_provider.dart';
import '../services/api_client.dart';
import '../widgets/status_chip.dart';
import 'extracted_info_screen.dart';
import 'processing_screen.dart';

class ClaimDetailsScreen extends StatefulWidget {
  const ClaimDetailsScreen({super.key, required this.reference, this.submitted = false});
  final String reference;
  final bool submitted;
  @override
  State<ClaimDetailsScreen> createState() => _ClaimDetailsScreenState();
}

class _ClaimDetailsScreenState extends State<ClaimDetailsScreen> {
  ClaimDetails? claim;
  String? error;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { loading = true; error = null; });
    try {
      claim = await context.read<ClaimsProvider>().service.details(widget.reference);
    } catch (exception) {
      error = readableApiError(exception);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isClient = context.watch<AuthProvider>().user?.isClient ?? false;
    return Scaffold(
      appBar: AppBar(title: Text(widget.reference), actions: [IconButton(onPressed: loading ? null : _load, icon: const Icon(Icons.refresh))]),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : claim == null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(error ?? 'Claim not found.')))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(padding: const EdgeInsets.all(16), children: [
                    if (widget.submitted) Card(color: Colors.green.shade50, child: const ListTile(leading: Icon(Icons.check_circle, color: Colors.green), title: Text('Claim submitted'), subtitle: Text('You can follow its status from this page.'))),
                    Row(children: [Expanded(child: Text(claim!.reference, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900))), StatusChip(status: claim!.status)]),
                    const SizedBox(height: 16),
                    Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
                      _Value(label: 'Patient', value: claim!.patientName.isEmpty ? 'Awaiting confirmation' : claim!.patientName),
                      _Value(label: 'Provider', value: claim!.providerName.isEmpty ? 'Awaiting confirmation' : claim!.providerName),
                      _Value(label: 'Amount', value: claim!.claimedAmount == null ? 'Awaiting confirmation' : '${claim!.currency} ${claim!.claimedAmount!.toStringAsFixed(2)}'),
                      _Value(label: 'Created', value: DateFormat('dd MMM yyyy, HH:mm').format(claim!.createdAt.toLocal()), last: true),
                    ]))),
                    if (isClient && claim!.status == 'UPLOADED') ...[
                      const SizedBox(height: 12),
                      FilledButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ExtractedInfoScreen(reference: claim!.reference))), icon: const Icon(Icons.fact_check_outlined), label: const Text('Confirm extracted information')),
                    ],
                    if (isClient && claim!.status == 'PROCESSING_FAILED') ...[
                      const SizedBox(height: 12),
                      FilledButton.icon(onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => ProcessingScreen(reference: claim!.reference))), icon: const Icon(Icons.refresh), label: const Text('Retry processing')),
                    ],
                    const SizedBox(height: 24),
                    Text('Documents (${claim!.documents.length})', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 10),
                    ...claim!.documents.map((document) => _DocumentCard(document: document)),
                    const SizedBox(height: 24),
                    Text('Audit history', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 10),
                    if (claim!.auditEvents.isEmpty) const Text('No audit events are available.'),
                    ...claim!.auditEvents.map((event) => ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.circle, size: 10), title: Text((event['event_type'] as String).replaceAll('_', ' ')), subtitle: Text(DateFormat('dd MMM yyyy, HH:mm').format(DateTime.parse(event['created_at'] as String).toLocal())))),
                  ]),
                ),
    );
  }
}

class _Value extends StatelessWidget {
  const _Value({required this.label, required this.value, this.last = false});
  final String label;
  final String value;
  final bool last;
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.symmetric(vertical: 10), decoration: BoxDecoration(border: last ? null : Border(bottom: BorderSide(color: Colors.grey.shade200))), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 90, child: Text(label, style: TextStyle(color: Colors.grey.shade700))), Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w700)))]));
}

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({required this.document});
  final ClaimDocument document;
  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: ExpansionTile(
          leading: const Icon(Icons.description_outlined),
          title: Text(document.originalName, maxLines: 2, overflow: TextOverflow.ellipsis),
          subtitle: Text('${document.documentType.replaceAll('_', ' ')} · ${document.extractionStatus.replaceAll('_', ' ')}'),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            if (document.signedUrl != null)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => launchUrl(Uri.parse(document.signedUrl!), mode: LaunchMode.externalApplication),
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('Open private source document'),
                ),
              ),
            if (document.extractionNotes != null) Align(alignment: Alignment.centerLeft, child: Text(document.extractionNotes!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
            if (document.fields.isEmpty) const Align(alignment: Alignment.centerLeft, child: Text('No fields were extracted from this document.')),
            ...document.fields.map((field) => ListTile(contentPadding: EdgeInsets.zero, title: Text(field.fieldName.replaceAll('_', ' ')), subtitle: Text(field.normalizedValue), trailing: Text('${(field.confidence * 100).round()}%'))),
          ],
        ),
      );
}
