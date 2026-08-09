import { buildDynamicFormState, mergeAdditionalProjectData, buildLegacyOverrides } from "../src/lib/field-definitions";
const defs: any[] = [
 {id:"1",section:"specifications",field_key:"floor_area",label_en:"Floor Area",field_type:"measurement",settings:{legacy_value_column:"floor_area_value",legacy_unit_column:"floor_area_unit",default_unit:"sq. ft."}},
 {id:"2",section:"credits",field_key:"architect_of_record",label_en:"AOR",field_type:"text",settings:{legacy_column:"architect_of_record"}},
 {id:"3",section:"credits",field_key:"code_consultant",label_en:"Code",field_type:"text",settings:{}},
 {id:"4",section:"specifications",field_key:"units",label_en:"Units",field_type:"number",settings:{legacy_column:"units_count"}},
 {id:"5",section:"specifications",field_key:"construction_budget",label_en:"Budget",field_type:"currency",settings:{legacy_column:"construction_budget"}},
];
const details: any = {additional_project_data:{some_future_data:{a:1},specifications:{floor_area:{value:33034,unit:"sq. ft."},construction_budget:{display:"$19 millions"}},credits:{architect_of_record:"Architect 57",interior_designer:"ABC"}},floor_area_value:1,units_count:66};
const st = buildDynamicFormState(defs, details);
console.log(JSON.stringify(st));
st.specifications.floor_area.value="44000";
st.credits.architect_of_record.value="";
st.credits.code_consultant.value="XYZ Code";
console.log(JSON.stringify(mergeAdditionalProjectData(details.additional_project_data, defs, st)));
console.log(JSON.stringify(buildLegacyOverrides(defs, st)));
