<script lang="ts">
  import { onMount } from 'svelte';
  import Admin from './Admin.svelte';
  import SetupWizard from './SetupWizard.svelte';
  import { setupRequest, type SetupStatus } from './setup';
  let status = $state<SetupStatus | null>(null);
  let wizard = $state(true), error = $state('');
  let manual = $state(false);
  onMount(async () => {
    try { status = await setupRequest<SetupStatus>('status'); wizard = status.phase !== 'completed' || !status.onboarding_complete; }
    catch { error = 'Einrichtungsstatus nicht erreichbar. Weboberfläche erneut über Home Assistant öffnen.'; }
  });
</script>
{#if error}<main><h1>Core Contracts</h1><p role="alert">{error}</p></main>
{:else if !status}<main><h1>Core Contracts</h1><p role="status">Installationszustand wird geprüft …</p></main>
{:else if wizard}<SetupWizard initial={status} automatic={!manual} oncomplete={() => wizard = false}/>
{:else}<Admin onsetup={() => { manual = true; wizard = true; }}/>{/if}
