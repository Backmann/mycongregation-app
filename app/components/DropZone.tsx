import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Called with a dropped .epub file (web only). */
  onFile: (file: File) => void;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * EPUB drag-and-drop. Web-only: on native it just renders children (OS file
 * drop isn't available there). Uses a ref + addEventListener on the real DOM
 * node rather than JSX props, because react-native-web filters unknown DOM
 * handlers off <View>, so onDrop/onDragOver passed as props never reach the
 * underlying <div>.
 */
export function DropZone({ onFile, disabled, children }: Props) {
  const { t } = useTranslation();
  const ref = useRef<any>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // ref.current on RN-web is the actual DOM node.
    const node: HTMLElement | null = ref.current as any;
    if (!node || typeof window === 'undefined') return;

    let depth = 0;

    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onEnter = (e: DragEvent) => {
      stop(e);
      if (disabled) return;
      depth += 1;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      stop(e);
      if (!disabled && e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      stop(e);
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        setActive(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      stop(e);
      depth = 0;
      setActive(false);
      if (disabled) return;
      const file = e.dataTransfer?.files?.[0];
      if (file && file.name.toLowerCase().endsWith('.epub')) {
        onFile(file);
      }
    };

    node.addEventListener('dragenter', onEnter);
    node.addEventListener('dragover', onOver);
    node.addEventListener('dragleave', onLeave);
    node.addEventListener('drop', onDrop);
    return () => {
      node.removeEventListener('dragenter', onEnter);
      node.removeEventListener('dragover', onOver);
      node.removeEventListener('dragleave', onLeave);
      node.removeEventListener('drop', onDrop);
    };
  }, [disabled, onFile]);

  const isWeb = Platform.OS === 'web';

  return (
    <View ref={ref} style={[isWeb && styles.zone, active && styles.zoneActive]}>
      {children}
      {isWeb ? (
        <Text style={[styles.hint, active && styles.hintActive]}>
          {active
            ? t('schedule.import.dropRelease')
            : t('schedule.import.dropHint')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 8,
  },
  zoneActive: {
    borderColor: '#0ea5e9',
    backgroundColor: 'rgba(14,165,233,0.06)',
  },
  hint: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 8,
  },
  hintActive: { color: '#0ea5e9', fontWeight: '600' },
});
