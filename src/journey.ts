/** The actor, attached equipment and cockpit models share one physical scale. */
export const travelerScale = 1.5;
export const travelerStages = {
  student: { from: 0 },
  worker: { from: 1120 },
  professional: { from: 5510 },
} as const;
export type TravelerStage = keyof typeof travelerStages;
/** Match the altimeter's displayed 10-metre steps; the professional outfit remains through 33,640 M and until space boarding. */
export function travelerStageAtAltitude(metres: number): TravelerStage {
  const displayed = Math.round(Math.max(0, metres) / 10) * 10;
  return displayed >= travelerStages.professional.from ? 'professional' : displayed >= travelerStages.worker.from ? 'worker' : 'student';
}
