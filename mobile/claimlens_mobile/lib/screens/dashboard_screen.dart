import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/claims_provider.dart';
import '../widgets/claim_card.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<ClaimsProvider>().loadDashboard());
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<ClaimsProvider>();
    final user = context.watch<AuthProvider>().user!;
    final dashboard = data.dashboard;
    return Scaffold(
      appBar: AppBar(title: const Text('Overview'), actions: [IconButton(onPressed: data.busy ? null : data.loadDashboard, icon: const Icon(Icons.refresh))]),
      body: RefreshIndicator(
        onRefresh: data.loadDashboard,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Text('Hello, ${user.displayName}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(user.isClient ? 'Track your submissions and complete any required action.' : 'Your role-based operational view.', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 20),
          if (data.error != null) _ErrorCard(message: data.error!, retry: data.loadDashboard),
          if (data.dashboard == null && data.busy) const Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator())),
          if (dashboard != null) ...[
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.6,
              children: [
                _Metric(label: 'All claims', value: dashboard.total, icon: Icons.folder_copy_outlined),
                _Metric(label: 'Processing', value: dashboard.processing, icon: Icons.sync),
                _Metric(label: 'Needs review', value: dashboard.reviewRequired, icon: Icons.fact_check_outlined),
                _Metric(label: 'Verified', value: dashboard.verified, icon: Icons.verified_outlined),
                _Metric(label: 'Failed', value: dashboard.failed, icon: Icons.error_outline),
              ],
            ),
            const SizedBox(height: 24),
            Text('Recent claims', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            if (dashboard.recent.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(24), child: Text('No claims yet. Use New claim to upload your first documents.'))),
            ...dashboard.recent.map((claim) => Padding(padding: const EdgeInsets.only(bottom: 12), child: ClaimCard(claim: claim))),
          ],
        ]),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value, required this.icon});
  final String label;
  final int value;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(icon, color: Theme.of(context).colorScheme.primary), const Spacer(), Text('$value', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)), Text(label)])));
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, required this.retry});
  final String message;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Card(color: Theme.of(context).colorScheme.errorContainer, child: Padding(padding: const EdgeInsets.all(16), child: Row(children: [Expanded(child: Text(message)), TextButton(onPressed: retry, child: const Text('Retry'))])));
}
