// Direct MP3 streams from SomaFM's PLS playlists; browsers cannot play PLS files.
export const stereoStations = [
  {
    id: "groovesalad",
    name: "Groove Salad",
    stream: "https://ice2.somafm.com/groovesalad-128-mp3",
  },
  {
    id: "secretagent",
    name: "Secret Agent",
    stream: "https://ice6.somafm.com/secretagent-128-mp3",
  },
  { id: "vaporwaves", name: "Vaporwaves", stream: "https://ice5.somafm.com/vaporwaves-128-mp3" },
  {
    id: "heavyweight-reggae",
    name: "Heavyweight Reggae",
    stream: "https://ice5.somafm.com/reggae-128-mp3",
  },
  {
    id: "underground-80s",
    name: "Underground 80s",
    stream: "https://ice5.somafm.com/u80s-128-mp3",
  },
  { id: "metal", name: "Metal Detector", stream: "https://ice6.somafm.com/metal-128-mp3" },
] as const;

export type StereoStationId = (typeof stereoStations)[number]["id"];

export function isStereoStation(value: string): value is StereoStationId {
  return stereoStations.some(({ id }) => id === value);
}

export class CarStereo {
  private readonly audio = new Audio();
  private powered = false;
  private station: (typeof stereoStations)[number] = stereoStations[0];
  private playbackAttempt = 0;
  private awaitingGesture = false;
  private readonly retryPlayback = (event: Event) => {
    // S is handled by press(), which retries rather than advancing while blocked.
    if (event instanceof KeyboardEvent && event.code === "KeyS") return;
    if (this.awaitingGesture) this.playStation();
  };

  get isPowered() {
    return this.powered;
  }

  constructor(
    private readonly reportPower: (powered: boolean) => void,
    private readonly reportError: (error: unknown) => void,
    muted = false,
  ) {
    this.audio.preload = "none";
    this.audio.muted = muted;
    this.audio.addEventListener("error", () => {
      this.fail(new Error(this.audio.error?.message || `${this.station.name} stream unavailable.`));
    });
  }

  setMuted(muted: boolean) {
    this.audio.muted = muted;
  }

  press(direction: "previous" | "next" = "next"): StereoStationId {
    if (this.awaitingGesture) {
      this.playStation();
    } else if (this.powered) {
      const index = stereoStations.indexOf(this.station);
      const step = direction === "previous" ? -1 : 1;
      const next = index + step;
      if (next < 0 || next >= stereoStations.length) {
        this.turnOff();
        this.station = stereoStations[direction === "previous" ? stereoStations.length - 1 : 0];
      } else {
        this.setStation(stereoStations[next].id);
      }
    } else {
      this.turnOn();
    }
    return this.station.id;
  }

  turnOn() {
    if (this.powered) return;
    this.powered = true;
    this.playStation();
  }

  private turnOff() {
    this.clearGestureRetry();
    this.powered = false;
    this.playbackAttempt++;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.reportPower(false);
  }

  setStation(id: StereoStationId) {
    const station = stereoStations.find((station) => station.id === id);
    if (!station) throw new Error(`Unknown stereo station: ${id}`);
    if (this.station === station) return;
    this.station = station;
    if (this.powered) this.playStation();
  }

  private playStation() {
    this.clearGestureRetry();
    const attempt = ++this.playbackAttempt;
    this.reportPower(true);
    this.audio.src = this.station.stream;
    // Call play directly in the key handler to retain browser user activation.
    void this.audio.play().catch((error: unknown) => {
      if (attempt !== this.playbackAttempt) return;
      if (error instanceof Error && error.name === "NotAllowedError") {
        this.awaitingGesture = true;
        window.addEventListener("pointerdown", this.retryPlayback);
        window.addEventListener("keydown", this.retryPlayback);
        this.reportError(
          new Error("Browser blocked stereo autoplay. Click or press a key to start playback."),
        );
      } else {
        this.fail(error);
      }
    });
  }

  private clearGestureRetry() {
    if (!this.awaitingGesture) return;
    this.awaitingGesture = false;
    window.removeEventListener("pointerdown", this.retryPlayback);
    window.removeEventListener("keydown", this.retryPlayback);
  }

  private fail(error: unknown) {
    if (!this.powered) return;
    this.clearGestureRetry();
    this.powered = false;
    this.audio.pause();
    this.reportPower(false);
    this.reportError(error);
  }
}
