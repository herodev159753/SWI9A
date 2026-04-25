export const formatTimeAgo = (dateString, t) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  
  if (diffMs < 0) return 'Just now';
  
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t ? t('just_now') || 'Just now' : 'Just now';
  if (diffMins < 60) return `${diffMins} ${t ? t('mins_ago') || 'mins ago' : 'mins ago'}`;
  
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} ${t ? t('hrs_ago') || 'hrs ago' : 'hrs ago'}`;
  
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} ${t ? t('days_ago') || 'days ago' : 'days ago'}`;
};

export const formatDuration = (startString, endString, t) => {
  if (!startString || !endString) return '—';
  const start = new Date(startString);
  const end = new Date(endString);
  const diffMs = end - start;
  
  if (diffMs < 0) return '—';
  
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} ${t ? t('mins') || 'mins' : 'mins'}`;
  
  const hrs = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hrs} ${t ? t('hrs') || 'hrs' : 'hrs'} ${mins} ${t ? t('mins') || 'mins' : 'mins'}`;
};
