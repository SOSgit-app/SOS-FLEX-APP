const downloadExcel = () => {
  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  
  // Get all referee data from the list
  const data = referees.map(referee => ({
    Field: referee.field,
    Referee: referee.name,
    "Head Referee": referee.isHeadReferee ? "Yes" : "No"
  }));

  // Convert data to worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, "Lead Referees");
  
  // Generate Excel file and trigger download
  XLSX.writeFile(workbook, "lead_referees.xlsx");
}; 