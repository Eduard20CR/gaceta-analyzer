import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { LOGIN_PATH, endSession } from '../auth';
import { Button } from './Button';

/** "Cerrar sesión" (FR-01): forgets the password on this device and opens the login page. */
export function LogoutButton() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  function handleClick() {
    endSession(queryClient);
    void navigate(LOGIN_PATH, { replace: true });
  }

  return (
    <Button variant="secondary" onClick={handleClick}>
      Cerrar sesión
    </Button>
  );
}
