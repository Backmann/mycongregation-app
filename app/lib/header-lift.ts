import { createElement, useCallback, useRef } from "react";
import { useNavigation } from "expo-router";
import { HeaderSurface } from "../components/HeaderSurface";
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

/**
 * Как часто спрашивать положение списка — и почему НЕ 16.
 *
 * У ScrollView сказано прямым текстом: значение 16 и меньше ОТКЛЮЧАЕТ
 * ограничение. То есть привычное «раз в 16 мс» на деле означает «каждый кадр»,
 * и главная начала дёргаться на Android: шестьдесят переходов в JS в секунду
 * ради одного сравнения числа с двенадцатью. До этого обработчика прокрутки на
 * экране не было вовсе, поэтому цена появилась сразу и вся.
 *
 * Ста миллисекунд хватает с запасом: мы ловим не движение, а ПЕРЕСЕЧЕНИЕ
 * порога, и тень, опоздавшая на одну десятую секунды, неотличима от
 * мгновенной. Дёрганье — отличимо.
 */
const SCROLL_EVERY_MS = 100;

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
      // Своя подложка, а не `headerShadowVisible`: у той настройки в браузере
      // нет тени вовсе — только нижняя граница цветом темы, неразличимая на
      // бирюзовом. См. components/HeaderSurface.tsx.
      //
      // createElement, а не JSX, чтобы этот файл остался обычным .ts: одна
      // строка здесь дешевле переименования файла, который читают семнадцать
      // мест.
      navigation.setOptions({
        headerBackground: next
          ? () => createElement(HeaderSurface, { lifted: true })
          : undefined,
      });
    },
    [navigation],
  );

  return { onScroll, scrollEventThrottle: SCROLL_EVERY_MS };
}
