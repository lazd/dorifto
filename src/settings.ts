import { Tabs } from './tabs';
import './settings.css';

export function bindSettingsLayout() {
  const root = document.getElementById('settings-tabs');
  if (!root) throw new Error('Missing settings tabs');
  return new Tabs(root);
}
