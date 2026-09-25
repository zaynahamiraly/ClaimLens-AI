import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/claims_provider.dart';
import '../widgets/claim_card.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});
  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final search = TextEditingController();
  String? status;
  Timer? debounce;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  void _load() => context.read<ClaimsProvider>().loadClaims(search: search.text, status: status);

  @override
  void dispose() {
    debounce?.cancel();
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ClaimsProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('Claim history')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            TextField(controller: search, decoration: const InputDecoration(labelText: 'Search reference, patient or provider', prefixIcon: Icon(Icons.search)), onChanged: (_) { debounce?.cancel(); debounce = Timer(const Duration(milliseconds: 350), _load); }),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: status,
              decoration: const InputDecoration(labelText: 'Status'),
              items: const [
                DropdownMenuItem(value: null, child: Text('All statuses')),
                DropdownMenuItem(value: 'UPLOADED', child: Text('Awaiting confirmation')),
                DropdownMenuItem(value: 'PROCESSING', child: Text('Processing')),
                DropdownMenuItem(value: 'REVIEW_REQUIRED', child: Text('Review required')),
                DropdownMenuItem(value: 'VERIFIED', child: Text('Verified')),
                DropdownMenuItem(value: 'PROCESSING_FAILED', child: Text('Processing failed')),
              ],
              onChanged: (value) { setState(() => status = value); _load(); },
            ),
          ]),
        ),
        if (provider.busy) const LinearProgressIndicator(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => _load(),
            child: provider.error != null
                ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(provider.error!))])
                : provider.claims.isEmpty
                    ? ListView(children: const [Padding(padding: EdgeInsets.all(24), child: Text('No claims match these filters.'))])
                    : ListView.separated(padding: const EdgeInsets.fromLTRB(16, 0, 16, 100), itemCount: provider.claims.length, separatorBuilder: (_, __) => const SizedBox(height: 12), itemBuilder: (_, index) => ClaimCard(claim: provider.claims[index])),
          ),
        ),
      ]),
    );
  }
}
