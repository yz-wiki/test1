/**
 * Playback output device — one state for the whole app.
 *
 * The quick switcher in the bottom bar, the one on the expanded player and
 * the full list in Settings all read and write this store. Having three local
 * copies used to let them disagree about which device was active.
 *
 * ABS has no notion of a client output device, so the choice is per install.
 * `set_audio_device` is a no-op until LibVLC has a media player, which is why
 * `refresh()` reapplies the saved id once the list can be enumerated.
 */
import { getAudioDevices, setAudioDevice, type AudioDevice } from './ipc';

const KEY = 'skald.audioDevice';

class AudioDeviceStore {
  devices = $state<AudioDevice[]>([]);
  current = $state<string>(localStorage.getItem(KEY) ?? '');
  loaded = $state(false);

  /** What to show on the button: the chosen device, or the system default. */
  readonly label = $derived.by(() => {
    if (!this.current) return 'System Default';
    return this.devices.find(device => device.id === this.current)?.name ?? 'System Default';
  });

  readonly options = $derived(
    this.devices.map(device => ({ value: device.id, label: device.name })),
  );

  async refresh(): Promise<void> {
    try {
      const list = await getAudioDevices();
      this.devices = list.length > 0 ? list : [{ id: '', name: 'System Default' }];
      this.loaded = true;
      // Re-apply the remembered choice when the player becomes available.
      if (this.current) await setAudioDevice(this.current);
    } catch {
      this.devices = [{ id: '', name: 'System Default' }];
      this.loaded = true;
    }
  }

  async choose(id: string): Promise<void> {
    this.current = id;
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
    try {
      await setAudioDevice(id);
    } catch {
      // A missing player is not fatal; the next refresh will reapply it.
    }
  }
}

export const audioDevices = new AudioDeviceStore();
