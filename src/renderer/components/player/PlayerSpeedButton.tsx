import { SpeedMenu } from './SpeedMenu';

interface PlayerSpeedButtonProps {
  value: number;
  disabled?: boolean;
  onChange: (speed: number) => void;
  onOpenChange?: (open: boolean) => void;
}

export function PlayerSpeedButton(props: PlayerSpeedButtonProps) {
  return (
    <SpeedMenu
      variant="chip"
      value={props.value}
      disabled={props.disabled}
      dataVideoControl
      onChange={props.onChange}
      onOpenChange={props.onOpenChange}
    />
  );
}
