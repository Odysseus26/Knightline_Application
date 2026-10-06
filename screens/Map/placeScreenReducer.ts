import type { StartPoint } from '../../hooks/useItinerary';

export type PlaceScreen =
  | { state: 'detail'; placeId: string }
  | { state: 'choose-start'; placeId: string }
  | { state: 'pick-start'; placeId: string; from: 'detail' | 'choose-start' }
  | { state: 'journey'; placeId: string; start: StartPoint };

export type PlaceScreenAction =
  | { type: 'open-detail'; placeId: string }
  | { type: 'request-route'; locationAvailable: boolean }
  | { type: 'pick-specific-start' }
  | { type: 'start-picked'; start: StartPoint }
  | { type: 'back' }
  | { type: 'close' }
  | { type: 'reset'; screen: PlaceScreen | null };


export function placeScreenReducer(
  screen: PlaceScreen | null,
  action: PlaceScreenAction,
): PlaceScreen | null {
  switch (action.type) {
    case 'open-detail':
      return { state: 'detail', placeId: action.placeId };

    case 'request-route': {
      if (!screen || screen.state !== 'detail') return screen;
      if (action.locationAvailable) {
        return { state: 'choose-start', placeId: screen.placeId };
      }
      return { state: 'pick-start', placeId: screen.placeId, from: 'detail' };
    }

    case 'pick-specific-start':
      if (!screen || screen.state !== 'choose-start') return screen;
      return {
        state: 'pick-start',
        placeId: screen.placeId,
        from: 'choose-start',
      };

    case 'start-picked': {
  if (!screen) return screen;
  if (screen.state !== 'pick-start' && screen.state !== 'choose-start') {
    return screen;
  }
  return { state: 'journey', placeId: screen.placeId, start: action.start };
}

    case 'back': {
      if (!screen) return null;
      switch (screen.state) {
        case 'detail':
          return null;
        case 'choose-start':
          return { state: 'detail', placeId: screen.placeId };
        case 'pick-start':
          return screen.from === 'detail'
            ? { state: 'detail', placeId: screen.placeId }
            : { state: 'choose-start', placeId: screen.placeId };
        case 'journey':
          return { state: 'detail', placeId: screen.placeId };
      }
      return null;
    }

    case 'close':
      return null;

    case 'reset':
      return action.screen;
  }
}