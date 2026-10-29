const types:Record<string,{color:string;label:string}>={
  pdf:{color:'#ec4d56',label:'PDF'},
  doc:{color:'#397dde',label:'W'},docx:{color:'#397dde',label:'W'},
  ppt:{color:'#ef8b4c',label:'P'},pptx:{color:'#ef8b4c',label:'P'},
  md:{color:'#566273',label:'M'},txt:{color:'#667787',label:'T'},
}

/** Project-drawn format badge, matching the approved folded-page reference. */
export function DocumentIcon({extension}:{extension:string}){
  const {color,label}=types[extension]??types.txt
  return <svg className="document-type-icon" viewBox="0 0 30 38" aria-hidden="true" data-file-type={extension}>
    <path d="M3 1h16l9 9v26H3Z" fill={color} stroke="#f1f5f8" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M19 1v9h9" fill="#ffffff55" stroke="#f1f5f8" strokeWidth="1.2" strokeLinejoin="round"/>
    <text x="15" y="28" textAnchor="middle" fill="white" fontFamily="Inter,sans-serif" fontWeight="600" fontSize={label.length>1?9:18}>{label}</text>
  </svg>
}
