import { useCallback, useRef } from "react";
import { useNavigation } from "expo-router";
import type { NativeSyntheticEvent, NativeScrollEvent } from "react-native";

/**
 * Первое движение, от которого шапка отрывается от содержимого.
 *
 * Шапка стояла плоско: тень была нарисована всегда, поэтому она ничего не
 * означала — одинаковая полоса и в начале списка, и на середине прокрутки.
 * Глубина возникает не от эффекта, а от того, что тень появляется В МОМЕНТ,
 * когда содержимое уезжает вниз: тогда видно, что шапка лежит СВЕРХУ, а не
 * приклеена к экрану.
 *
 * Порог, а не непрерывная величина. Настройки навигатора меняются вызовом
 * `setOptions`, и делать это на каждом кадре прокрутки значило бы
 * перерисовывать шапку шестьдесят раз в секунду ради тени. Здесь состояния
 * ровно два, и переход между ними случается дважды за прокрутку.
 *
 * Двенадцать пикселей, а не ноль: список слегка качается от касания пальцем, и
 * на нуле тень мигала бы от каждого прикосновения к экрану.
 */
const LIFT_AT = 12;

export function useHeaderLift(): {
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
} {
  const navigation = useNavigation();
  // Ref, а не состояние: экран перерисовывать незачем — меняется только
  // настройка шапки, и обработчик не должен пересоздаваться на каждом кадре.
  const liftedRef = useRef(false);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = e.nativeEvent.contentOffset.y > LIFT_AT;
      if (next === liftedRef.current) return;
      liftedRef.current = next;
      navigation.setOptions({ headerShadowVisible: next });
    },
    [navigation],
  );

  return { onScroll, scrollEventThrottle: 16 };
}
