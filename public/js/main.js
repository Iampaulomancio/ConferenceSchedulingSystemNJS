document.addEventListener('DOMContentLoaded', function () {
  const recurrenceSelect = document.getElementById('recurrence_type');
  const recurrenceEndDate = document.getElementById('recurrence_end_date');
  if (recurrenceSelect && recurrenceEndDate) {
    const toggleRequired = () => {
      recurrenceEndDate.required = recurrenceSelect.value !== 'none';
    };
    recurrenceSelect.addEventListener('change', toggleRequired);
    toggleRequired();
  }

  const meetingType = document.getElementById('meeting_type');
  const zoomRequired = document.getElementById('zoom_link_required');
  if (meetingType && zoomRequired) {
    const syncZoomFlag = () => {
      if (meetingType.value === 'online') {
        zoomRequired.checked = true;
      }
    };
    meetingType.addEventListener('change', syncZoomFlag);
  }

  const calendarEl = document.getElementById('calendar');
  if (calendarEl && window.calendarConfig) {
    const roomFilter = document.getElementById('roomFilter');
    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      events(fetchInfo, successCallback, failureCallback) {
        const roomId = roomFilter ? roomFilter.value : '';
        const url = `${window.calendarConfig.eventsUrl}?start=${encodeURIComponent(fetchInfo.startStr)}&end=${encodeURIComponent(fetchInfo.endStr)}${roomId ? `&roomId=${roomId}` : ''}`;
        fetch(url)
          .then((res) => res.json())
          .then(successCallback)
          .catch(failureCallback);
      },
      eventClick(info) {
        const props = info.event.extendedProps;
        alert(
          `Room: ${props.roomName}\nReserved By: ${props.reservedBy}\nPurpose: ${props.purpose || '-'}\nMeeting Type: ${props.meetingType}${props.zoomNeeded ? '\nNeeds Zoom Link: Yes' : ''}`
        );
      }
    });
    calendar.render();

    if (roomFilter) {
      roomFilter.addEventListener('change', () => calendar.refetchEvents());
    }
  }
});
