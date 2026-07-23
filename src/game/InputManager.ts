import { LANE_CODES } from "./config";

export class InputManager {
  private pressed = new Set<number>();

  laneForCode(code: string) {
    const lane = LANE_CODES.indexOf(code as (typeof LANE_CODES)[number]);
    return lane >= 0 ? lane : null;
  }

  press(code: string, isKeyboardRepeat = false) {
    const lane = this.laneForCode(code);
    if (lane === null || isKeyboardRepeat) return null;
    this.pressed.add(lane);
    return lane;
  }

  release(code: string) {
    const lane = this.laneForCode(code);
    if (lane === null) return null;
    this.pressed.delete(lane);
    return lane;
  }

  clear() {
    this.pressed.clear();
  }

  get heldLanes() {
    return this.pressed;
  }
}
