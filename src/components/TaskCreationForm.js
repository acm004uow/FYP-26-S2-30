import ManagerNewTask from '../actors/manager/bookings/NewTask'

export default function TaskCreationForm(props) {
  return <ManagerNewTask {...props} embedded />
}
