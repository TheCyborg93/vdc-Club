export const vdcFinanceGlobalCss = {
  ".year-filter": {
    display:"flex",alignItems:"center",gap:"2",flexWrap:"wrap",
    "& select":{minH:"9",px:"2.5",border:"1px solid",borderColor:"surface.border",borderRadius:"l1",background:"surface.bg",color:"fg"},
  },
  ".finance-month-grid": {
    display:"grid",gridTemplateColumns:{base:"repeat(2,minmax(0,1fr))",md:"repeat(4,minmax(0,1fr))",xl:"repeat(6,minmax(0,1fr))"},gap:"2",
  },
  ".finance-month-grid>div": {
    p:"2.5",border:"1px solid",borderColor:"surface.border",borderRadius:"l2",background:"surface.raised",
    "& span,& strong,& small":{display:"block"},"& span":{color:"fg.muted",fontSize:"[9px]"},"& strong":{mt:"1",fontSize:"sm",fontWeight:"900"},"& small":{mt:"1",color:"fg.subtle",fontSize:"[9px]"},
  },
  ".finance-analysis-list,.finance-list,.contribution-list,.member-fee-profile-list,.fee-type-list,.open-fee-list":{display:"grid",gap:"2"},
  ".fee-analysis-table":{display:"grid",overflowX:"auto"},
  ".fee-analysis-head,.fee-analysis-row": {
    display:"grid",gridTemplateColumns:"minmax(170px,1.4fr) repeat(3,minmax(100px,.55fr))",gap:"2",alignItems:"center",minWidth:"620px",p:"2.5",borderTop:"1px solid",borderColor:"surface.border",
  },
  ".fee-analysis-head":{borderTop:"0",background:"surface.raised",color:"fg.muted",fontSize:"[9px]",fontWeight:"850",textTransform:"uppercase"},
  ".fee-analysis-row":{fontSize:"xs"},

  ".contribution-run-panel":{borderColor:"brand.border !important"},
  ".contribution-run-form": {
    display:"grid",gridTemplateColumns:{base:"1fr",md:"repeat(2,minmax(0,1fr))",xl:"minmax(150px,.7fr) minmax(150px,.7fr) minmax(0,1.4fr) auto"},gap:"2.5",alignItems:"end",
  },
  ".contribution-run-form label":{display:"grid",gap:"1.5",color:"fg.muted",fontSize:"xs",fontWeight:"750"},
  ".contribution-run-form input":{width:"full",minHeight:{base:"[44px]",md:"10"},p:"2.5",border:"1px solid",borderColor:"surface.border",borderRadius:"l1",background:"surface.bg",color:"fg",outline:"none",_focus:{borderColor:"brand.solid",boxShadow:"focus"}},
  ".contribution-run-copy": {"& strong,& span":{display:"block"},"& strong":{fontSize:"xs",fontWeight:"900"},"& span":{mt:"1",color:"fg.muted",fontSize:"[10px]",lineHeight:"1.4"}},

  ".contribution-card,.member-fee-profile-card,.fee-type-card": {
    overflow:"hidden",border:"1px solid",borderColor:"surface.border",borderRadius:"l2",background:"surface.bg",
    "&>summary":{display:"grid",gridTemplateColumns:{base:"1fr",sm:"minmax(0,1.4fr) minmax(110px,.5fr) auto"},gap:"3",alignItems:"center",p:"3",cursor:"pointer",listStyle:"none"},
    "&>summary::-webkit-details-marker":{display:"none"},
    "&[open]>summary":{borderBottom:"1px solid",borderColor:"surface.border",background:"surface.raised"},
  },
  ".fee-type-card>summary,.member-fee-profile-card>summary": {
    gridTemplateColumns:{base:"1fr",sm:"minmax(0,1fr) auto"},
  },
  ".contribution-person,.contribution-money": {
    "& strong,& span":{display:"block"},"& strong":{fontSize:"xs",fontWeight:"900"},"& span":{mt:"1",color:"fg.muted",fontSize:"[10px]"},
  },
  ".contribution-money":{textAlign:{sm:"right"}},
  ".contribution-body,.member-fee-profile-body,.fee-type-body":{display:"grid",gap:"3",p:"3",background:"surface.raised"},
  ".contribution-detail-grid,.contribution-actions-grid": {
    display:"grid",gridTemplateColumns:{base:"1fr",md:"repeat(2,minmax(0,1fr))"},gap:"2.5",
  },
  ".contribution-detail-grid>div": {
    p:"2.5",border:"1px solid",borderColor:"surface.border",borderRadius:"l1",background:"surface.bg",
    "& span,& strong":{display:"block"},"& span":{color:"fg.muted",fontSize:"[9px]"},"& strong":{mt:"1",fontSize:"xs"},
  },
  ".contribution-payment-form,.contribution-status-form":{display:"grid",gap:"2.5"},
  ".contribution-payment-form label,.contribution-status-form label":{display:"grid",gap:"1.5",color:"fg.muted",fontSize:"xs",fontWeight:"750"},
  ".contribution-payment-form input,.contribution-payment-form select,.contribution-status-form input,.contribution-status-form select,.contribution-status-form textarea": {
    width:"full",minHeight:{base:"[44px]",md:"10"},p:"2.5",border:"1px solid",borderColor:"surface.border",borderRadius:"l1",background:"surface.bg",color:"fg",outline:"none",_focus:{borderColor:"brand.solid",boxShadow:"focus"},
  },

  ".fee-type-readonly":{display:"grid",gap:"1.5",color:"fg.muted",fontSize:"xs"},
  ".checkbox-row": {
    display:"flex !important",alignItems:"center",gap:"2 !important",p:"2.5",border:"1px solid",borderColor:"surface.border",borderRadius:"l1",background:"surface.raised",
    "& input":{width:"auto !important",accentColor:"vdcRed"},
  },

  ".finance-row": {
    display:"grid",gridTemplateColumns:"34px minmax(0,1fr) auto",gap:"2.5",alignItems:"center",py:"2.5",borderTop:"1px solid",borderColor:"surface.border",
  },
  ".finance-row:first-child":{borderTop:"0"},
  ".finance-icon":{display:"grid",placeItems:"center",width:"8.5",height:"8.5",borderRadius:"pill",background:"surface.raised",fontWeight:"900"},
  ".finance-income":{color:"status.success"},
  ".finance-expense":{color:"status.danger"},
  ".finance-main": {"& strong,& span":{display:"block"},"& strong":{fontSize:"xs"},"& span":{mt:"1",color:"fg.muted",fontSize:"[10px]"}},

  ".open-fee-list":{display:"grid",gap:"2"},
  ".open-fee-list>article,.open-fee-reminder": {
    p:"3",border:"1px solid",borderColor:"surface.border",borderRadius:"l2",background:"surface.raised",
  },
  ".open-fee-reminder":{borderColor:"rgba(228,191,112,.22)",background:"rgba(228,191,112,.05)"},

  ".fee-status": {
    display:"inline-flex",width:"fit-content",px:"2.5",py:"1.5",borderRadius:"pill",fontSize:"[10px]",fontWeight:"850",
  },
  ".fee-open":{background:"rgba(228,191,112,.10)",color:"status.warning"},
  ".fee-paid":{background:"rgba(143,198,162,.10)",color:"status.success"},
  ".fee-exempt":{background:"rgba(134,188,232,.10)",color:"status.info"},
  ".fee-cancelled":{background:"rgba(228,121,114,.10)",color:"status.danger"},
} as const;
