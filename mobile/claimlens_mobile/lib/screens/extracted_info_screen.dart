import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/claim.dart';
import '../providers/claims_provider.dart';
import '../services/api_client.dart';
import 'claim_review_screen.dart';

class ExtractedInfoScreen extends StatefulWidget {
  const ExtractedInfoScreen({super.key, required this.reference});
  final String reference;
  @override
  State<ExtractedInfoScreen> createState() => _ExtractedInfoScreenState();
}

class _ExtractedInfoScreenState extends State<ExtractedInfoScreen> {
  final patient = TextEditingController();
  final provider = TextEditingController();
  final formKey = GlobalKey<FormState>();
  final confirmations = <DocumentConfirmation>[];
  final amountControllers = <String, TextEditingController>{};
  final fieldControllers = <String, TextEditingController>{};
  ClaimDetails? claim;
  bool loading = true;
  String? error;
  double? patientConfidence;
  double? providerConfidence;

  @override
  void initState() {
    super.initState();
    _load();
  }

  ExtractedField? _bestField(ClaimDetails value, String name) {
    final matches = value.documents.expand((document) => document.fields).where((field) => field.fieldName == name).toList()
      ..sort((left, right) => right.confidence.compareTo(left.confidence));
    return matches.isEmpty ? null : matches.first;
  }

  Future<void> _load() async {
    try {
      final value = await context.read<ClaimsProvider>().service.details(widget.reference);
      final patientField = _bestField(value, 'patient_name');
      final providerField = _bestField(value, 'provider_name');
      patient.text = patientField?.normalizedValue ?? value.patientName;
      provider.text = providerField?.normalizedValue ?? value.providerName;
      patientConfidence = patientField?.confidence;
      providerConfidence = providerField?.confidence;
      confirmations.clear();
      for (final document in value.documents) {
        final amount = document.confirmedAmount ?? document.extractedAmount;
        confirmations.add(DocumentConfirmation(
          document: document,
          include: document.duplicateOf == null && (document.includeInTotal || amount != null),
          amount: amount,
          currency: document.confirmedCurrency ?? document.extractedCurrency ?? value.currency,
        ));
        amountControllers[document.id]?.dispose();
        amountControllers[document.id] = TextEditingController(text: amount?.toStringAsFixed(2) ?? '');
        for (final field in document.fields.where((item) => !{'patient_name', 'provider_name', 'claimed_amount', 'invoice_total'}.contains(item.fieldName))) {
          fieldControllers[field.id]?.dispose();
          fieldControllers[field.id] = TextEditingController(text: field.normalizedValue);
        }
      }
      setState(() => claim = value);
    } catch (exception) {
      setState(() => error = readableApiError(exception));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  void dispose() {
    patient.dispose();
    provider.dispose();
    for (final controller in amountControllers.values) { controller.dispose(); }
    for (final controller in fieldControllers.values) { controller.dispose(); }
    super.dispose();
  }

  String? _required(String? value) => value == null || value.trim().length < 2 ? 'Confirm this value.' : null;

  void _review() {
    if (!formKey.currentState!.validate()) return;
    for (final confirmation in confirmations) {
      confirmation.amount = double.tryParse(amountControllers[confirmation.document.id]!.text.trim());
      if (confirmation.include && (confirmation.amount == null || confirmation.amount! <= 0)) {
        setState(() => error = 'Every included document needs a valid amount.');
        return;
      }
    }
    if (!confirmations.any((item) => item.include)) {
      setState(() => error = 'Include at least one payable document.');
      return;
    }
    final currencies = confirmations.where((item) => item.include).map((item) => item.currency).toSet();
    if (currencies.length != 1) {
      setState(() => error = 'Included documents must use the same currency.');
      return;
    }
    final fieldLabels = {for (final field in claim!.documents.expand((document) => document.fields)) field.id: field.fieldName.replaceAll('_', ' ')};
    final corrections = fieldControllers.entries
        .map((entry) => FieldCorrection(id: entry.key, label: fieldLabels[entry.key] ?? 'extracted field', value: entry.value.text.trim()))
        .where((field) => field.value.isNotEmpty)
        .toList();
    Navigator.push(context, MaterialPageRoute(builder: (_) => ClaimReviewScreen(reference: widget.reference, patientName: patient.text.trim(), providerName: provider.text.trim(), documents: confirmations, fields: corrections)));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Confirm extracted information')),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : claim == null
                ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(error ?? 'The claim could not be loaded.')))
                : Form(
                    key: formKey,
                    child: ListView(padding: const EdgeInsets.all(16), children: [
                      Card(
                        color: Theme.of(context).colorScheme.tertiaryContainer,
                        child: const Padding(padding: EdgeInsets.all(16), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(Icons.fact_check_outlined), SizedBox(width: 12), Expanded(child: Text('OCR values are proposals, not final decisions. Compare them with the source documents and correct anything that is wrong.'))])),
                      ),
                      const SizedBox(height: 16),
                      _ConfidenceField(controller: patient, label: 'Patient name', confidence: patientConfidence, validator: _required),
                      const SizedBox(height: 12),
                      _ConfidenceField(controller: provider, label: 'Provider name', confidence: providerConfidence, validator: _required),
                      const SizedBox(height: 24),
                      Text('Document amounts', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      const Text('Include payable evidence only. Medical certificates and duplicate copies should normally be excluded.'),
                      const SizedBox(height: 12),
                      ...confirmations.map((item) => _DocumentEditor(
                            item: item,
                            controller: amountControllers[item.document.id]!,
                            fieldControllers: fieldControllers,
                            onChanged: () => setState(() {}),
                          )),
                      if (error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                      const SizedBox(height: 16),
                      FilledButton.icon(onPressed: _review, icon: const Icon(Icons.arrow_forward), label: const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('Review claim total'))),
                    ]),
                  ),
      );
}

class _ConfidenceField extends StatelessWidget {
  const _ConfidenceField({required this.controller, required this.label, required this.confidence, required this.validator});
  final TextEditingController controller;
  final String label;
  final double? confidence;
  final FormFieldValidator<String> validator;
  @override
  Widget build(BuildContext context) => TextFormField(
        controller: controller,
        validator: validator,
        decoration: InputDecoration(labelText: label, helperText: confidence == null ? 'Not found by OCR — enter manually' : 'OCR confidence ${(confidence! * 100).round()}%'),
      );
}

class _DocumentEditor extends StatelessWidget {
  const _DocumentEditor({required this.item, required this.controller, required this.fieldControllers, required this.onChanged});
  final DocumentConfirmation item;
  final TextEditingController controller;
  final Map<String, TextEditingController> fieldControllers;
  final VoidCallback onChanged;
  @override
  Widget build(BuildContext context) {
    final document = item.document;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Expanded(child: Text(document.originalName, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))), Switch(value: item.include, onChanged: document.duplicateOf == null ? (value) { item.include = value; onChanged(); } : null)]),
          Text(document.documentType.replaceAll('_', ' ')),
          if (document.duplicateOf != null) const Text('Duplicate detected — excluded from total.', style: TextStyle(color: Colors.orange)),
          if (document.extractionNotes != null) Text(document.extractionNotes!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(flex: 2, child: TextFormField(controller: controller, enabled: item.include, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: 'Amount', helperText: document.amountConfidence == null ? 'Manual value' : 'Confidence ${(document.amountConfidence! * 100).round()}%'))),
            const SizedBox(width: 10),
            Expanded(child: DropdownButtonFormField<String>(initialValue: item.currency, decoration: const InputDecoration(labelText: 'Currency'), items: const ['MUR', 'USD', 'EUR', 'GBP', 'UGX', 'KES', 'TZS'].map((currency) => DropdownMenuItem(value: currency, child: Text(currency))).toList(), onChanged: item.include ? (value) { if (value != null) { item.currency = value; onChanged(); } } : null)),
          ]),
          if (document.fields.where((field) => !{'patient_name', 'provider_name', 'claimed_amount', 'invoice_total'}.contains(field.fieldName)).isNotEmpty) ...[
            const Divider(height: 24),
            ...document.fields.where((field) => !{'patient_name', 'provider_name', 'claimed_amount', 'invoice_total'}.contains(field.fieldName)).map(
              (field) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: TextFormField(
                  controller: fieldControllers[field.id],
                  decoration: InputDecoration(
                    labelText: field.fieldName.replaceAll('_', ' '),
                    helperText: field.extractionMethod == 'human_corrected' ? 'Human corrected' : 'OCR confidence ${(field.confidence * 100).round()}%',
                  ),
                ),
              ),
            ),
          ],
        ]),
      ),
    );
  }
}
