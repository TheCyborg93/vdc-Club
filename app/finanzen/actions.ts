"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseMoney(raw:string) {
  const n=Number(raw.replace(",","."));
  return Number.isFinite(n) ? Math.round(n*100)/100 : NaN;
}

function frequencyCount(frequency:string) {
  if (frequency==="monthly") return 12;
  if (frequency==="quarterly") return 4;
  if (frequency==="semiannual") return 2;
  return 1;
}

function safeDate(year:number,month:number,day:number) {
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  const safeDay=Math.min(Math.max(day,1),lastDay);
  return `${year}-${String(month).padStart(2,"0")}-${String(safeDay).padStart(2,"0")}`;
}

function installmentPlan({
  year,
  amount,
  frequency,
  firstDueMonth,
  dueDay,
}:{
  year:number;
  amount:number;
  frequency:string;
  firstDueMonth:number;
  dueDay:number;
}) {
  const count=frequencyCount(frequency);
  const step=12/count;
  const totalCents=Math.round(amount*100);
  const base=Math.floor(totalCents/count);
  let rest=totalCents-base*count;

  return Array.from({length:count},(_,index)=>{
    const rawMonth=(firstDueMonth-1)+(index*step);
    const dueYear=year+Math.floor(rawMonth/12);
    const dueMonth=(rawMonth%12)+1;
    const cents=base+(rest>0 ? 1 : 0);
    if (rest>0) rest--;
    return {
      installmentNo:index+1,
      dueDate:safeDate(dueYear,dueMonth,dueDay),
      amount:cents/100,
    };
  });
}

function revalidateFinance() {
  revalidatePath("/finanzen");
  revalidatePath("/finanzen/buchungen");
  revalidatePath("/finanzen/beitraege");
  revalidatePath("/finanzen/beitragsarten");
  revalidatePath("/finanzen/offene-beitraege");
  revalidatePath("/finanzen/auswertung");
  revalidatePath("/mitglieder");
}

export async function createFinanceEntryAction(formData: FormData) {
  const actor=await requirePermission("finance.write");
  const sql=getDb();
  if (!sql) redirect("/finanzen?error=database");

  const type=value(formData,"entryType");
  const amount=parseMoney(value(formData,"amount"));
  const category=value(formData,"category");
  const description=value(formData,"description");
  const bookedOn=value(formData,"bookedOn");
  const memberId=value(formData,"memberId");

  if (!["income","expense"].includes(type) || !Number.isFinite(amount) || amount < 0 || !category || !description || !bookedOn) {
    redirect("/finanzen?error=invalid");
  }

  const rows=await sql`
    INSERT INTO finance_entries (
      entry_type,amount,category,description,booked_on,status,member_id
    )
    VALUES (
      ${type},${amount},${category},${description},${bookedOn}::date,'booked',
      ${memberId || null}::uuid
    )
    RETURNING id::text
  `;

  await writeAudit(actor.id,"finance.entry_created","finance_entry",String(rows[0]?.id ?? ""),{
    type,amount,category,memberId:memberId || null,
  });
  revalidateFinance();
  redirect("/finanzen/buchungen?created=1");
}

export async function upsertBudgetAction(formData: FormData) {
  const actor=await requirePermission("finance.write");
  const sql=getDb();
  if (!sql) redirect("/finanzen?error=database");

  const year=Number(value(formData,"year"));
  const category=value(formData,"category");
  const amount=parseMoney(value(formData,"amount"));
  const notes=value(formData,"notes");

  if (!Number.isInteger(year) || !category || !Number.isFinite(amount) || amount < 0) {
    redirect("/finanzen?error=invalid");
  }

  await sql`
    INSERT INTO finance_budgets (fiscal_year,category,amount,notes)
    VALUES (${year},${category},${amount},${notes || null})
    ON CONFLICT (fiscal_year,category)
    DO UPDATE SET amount=EXCLUDED.amount,notes=EXCLUDED.notes
  `;

  await writeAudit(actor.id,"finance.budget_saved","finance_budget",null,{year,category,amount});
  revalidateFinance();
  redirect("/finanzen?budget=1");
}

export async function createMembershipFeeTypeAction(formData: FormData) {
  const actor=await requirePermission("finance.write");
  const sql=getDb();
  if (!sql) redirect("/finanzen/beitragsarten?error=database");

  const name=value(formData,"name");
  const annualAmount=parseMoney(value(formData,"annualAmount"));
  const paymentFrequency=value(formData,"paymentFrequency");
  const firstDueMonth=Number(value(formData,"firstDueMonth") || 1);
  const dueDay=Number(value(formData,"dueDay") || 1);
  const notes=value(formData,"notes");

  if (
    !name ||
    !Number.isFinite(annualAmount) ||
    annualAmount<0 ||
    !["annual","semiannual","quarterly","monthly"].includes(paymentFrequency) ||
    !Number.isInteger(firstDueMonth) || firstDueMonth<1 || firstDueMonth>12 ||
    !Number.isInteger(dueDay) || dueDay<1 || dueDay>31
  ) {
    redirect("/finanzen/beitragsarten?error=invalid");
  }

  const rows=await sql`
    INSERT INTO membership_fee_types (
      name,annual_amount,payment_frequency,first_due_month,due_day,notes
    )
    VALUES (
      ${name},${annualAmount},${paymentFrequency},${firstDueMonth},${dueDay},${notes || null}
    )
    RETURNING id::text
  `;

  await writeAudit(actor.id,"finance.fee_type_created","membership_fee_type",String(rows[0]?.id ?? ""),{
    name,annualAmount,paymentFrequency,
  });
  revalidateFinance();
  redirect("/finanzen/beitragsarten?created=1");
}

export async function updateMembershipFeeTypeAction(formData: FormData) {
  const actor=await requirePermission("finance.write");
  const sql=getDb();
  if (!sql) redirect("/finanzen/beitragsarten?error=database");

  const id=value(formData,"id");
  const name=value(formData,"name");
  const annualAmount=parseMoney(value(formData,"annualAmount"));
  const paymentFrequency=value(formData,"paymentFrequency");
  const firstDueMonth=Number(value(formData,"firstDueMonth"));
  const dueDay=Number(value(formData,"dueDay"));
  const notes=value(formData,"notes");
  const isActive=value(formData,"isActive")==="1";

  if (
    !id || !name || !Number.isFinite(annualAmount) || annualAmount<0 ||
    !["annual","semiannual","quarterly","monthly"].includes(paymentFrequency) ||
    !Number.isInteger(firstDueMonth) || firstDueMonth<1 || firstDueMonth>12 ||
    !Number.isInteger(dueDay) || dueDay<1 || dueDay>31
  ) redirect("/finanzen/beitragsarten?error=invalid");

  await sql`
    UPDATE membership_fee_types
    SET
      name=${name},
      annual_amount=${annualAmount},
      payment_frequency=${paymentFrequency},
      first_due_month=${firstDueMonth},
      due_day=${dueDay},
      notes=${notes || null},
      is_active=${isActive}
    WHERE id=${id}::uuid
  `;

  await writeAudit(actor.id,"finance.fee_type_updated","membership_fee_type",id,{
    name,annualAmount,paymentFrequency,isActive,
  });
  revalidateFinance();
  redirect("/finanzen/beitragsarten?updated=1");
}

export async function saveMemberFeeProfileAction(formData: FormData) {
  const actor=await requirePermission("finance.write");
  const sql=getDb();
  if (!sql) redirect("/finanzen/beitraege?error=database");

  const memberId=value(formData,"memberId");
  const feeTypeId=value(formData,"feeTypeId");
  const customAmountRaw=value(formData,"customAnnualAmount");
  const customFrequency=value(formData,"customPaymentFrequency");
  const referenceText=value(formData,"referenceText");
  const validFrom=value(formData,"validFrom");
  const validUntil=value(formData,"validUntil");
  const exemptFrom=value(formData,"exemptFrom");
  const exemptUntil=value(formData,"exemptUntil");
  const exemptionReason=value(formData,"exemptionReason");
  const notes=value(formData,"notes");

  const customAmount=customAmountRaw ? parseMoney(customAmountRaw) : null;
  if (
    !memberId ||
    (customAmount!==null && (!Number.isFinite(customAmount) || customAmount<0)) ||
    (customFrequency && !["annual","semiannual","quarterly","monthly"].includes(customFrequency))
  ) {
    redirect("/finanzen/beitraege?error=invalid");
  }

  await sql`
    INSERT INTO member_fee_profiles (
      member_id,fee_type_id,custom_annual_amount,custom_payment_frequency,
      reference_text,valid_from,valid_until,exempt_from,exempt_until,
      exemption_reason,notes
    )
    VALUES (
      ${memberId}::uuid,${feeTypeId || null}::uuid,${customAmount},
      ${customFrequency || null},${referenceText || null},
      ${validFrom || null}::date,${validUntil || null}::date,
      ${exemptFrom || null}::date,${exemptUntil || null}::date,
      ${exemptionReason || null},${notes || null}
    )
    ON CONFLICT (member_id)
    DO UPDATE SET
      fee_type_id=EXCLUDED.fee_type_id,
      custom_annual_amount=EXCLUDED.custom_annual_amount,
      custom_payment_frequency=EXCLUDED.custom_payment_frequency,
      reference_text=EXCLUDED.reference_text,
      valid_from=EXCLUDED.valid_from,
      valid_until=EXCLUDED.valid_until,
      exempt_from=EXCLUDED.exempt_from,
      exempt_until=EXCLUDED.exempt_until,
      exemption_reason=EXCLUDED.exemption_reason,
      notes=EXCLUDED.notes
  `;

  await writeAudit(actor.id,"finance.member_fee_profile_saved","member",memberId,{
    feeTypeId:feeTypeId || null,
    customAmount,
    customFrequency:customFrequency || null,
    exemptFrom:exemptFrom || null,
    exemptUntil:exemptUntil || null,
  });
  revalidateFinance();
  revalidatePath(`/mitglieder/${memberId}`);
  redirect("/finanzen/beitraege?profile=1");
}

export async function generateMembershipFeesAction(formData: FormData) {
  const actor=await requirePermission("finance.write");
  const sql=getDb();
  if (!sql) redirect("/finanzen/beitraege?error=database");

  const year=Number(value(formData,"year"));
  const enteredAmount=value(formData,"amount");
  const enteredDueDate=value(formData,"dueDate");

  const profileRows=await sql`
    SELECT default_annual_fee,fee_due_month,fee_due_day
    FROM club_profile
    WHERE id=1
    LIMIT 1
  `;
  const clubProfile=profileRows[0] ?? {};

  const fallbackAmount=enteredAmount
    ? parseMoney(enteredAmount)
    : Number(clubProfile.default_annual_fee ?? NaN);

  if (!Number.isInteger(year) || year<1900 || year>2200) {
    redirect("/finanzen/beitraege?error=invalid");
  }

  const memberRows=await sql`
    SELECT
      m.id::text,m.first_name,m.last_name,
      p.fee_type_id::text,
      p.custom_annual_amount,
      p.custom_payment_frequency,
      p.reference_text,
      p.valid_from,p.valid_until,p.exempt_from,p.exempt_until,p.exemption_reason,
      t.name AS fee_type_name,
      t.annual_amount AS type_amount,
      t.payment_frequency AS type_frequency,
      t.first_due_month,
      t.due_day
    FROM members m
    LEFT JOIN member_fee_profiles p ON p.member_id=m.id
    LEFT JOIN membership_fee_types t ON t.id=p.fee_type_id
    WHERE m.status='active'
    ORDER BY m.last_name,m.first_name
  `;

  const yearStart=`${year}-01-01`;
  const yearEnd=`${year}-12-31`;
  let created=0;

  for (const member of memberRows) {
    if (member.valid_from && String(member.valid_from)>yearEnd) continue;
    if (member.valid_until && String(member.valid_until)<yearStart) continue;

    const existing=await sql`
      SELECT id::text
      FROM membership_fees
      WHERE member_id=${String(member.id)}::uuid AND fiscal_year=${year}
      LIMIT 1
    `;
    if (existing[0]) continue;

    const annualAmount=member.custom_annual_amount!=null
      ? Number(member.custom_annual_amount)
      : member.type_amount!=null
        ? Number(member.type_amount)
        : fallbackAmount;

    if (!Number.isFinite(annualAmount) || annualAmount<0) continue;

    const frequency=String(
      member.custom_payment_frequency ||
      member.type_frequency ||
      "annual"
    );

    const fullyExempt=Boolean(
      member.exempt_from &&
      String(member.exempt_from)<=yearStart &&
      (!member.exempt_until || String(member.exempt_until)>=yearEnd)
    );

    let firstDueMonth=Number(member.first_due_month || clubProfile.fee_due_month || 1);
    let dueDay=Number(member.due_day || clubProfile.fee_due_day || 1);

    if (enteredDueDate) {
      const parts=enteredDueDate.split("-").map(Number);
      if (parts.length===3) {
        firstDueMonth=parts[1];
        dueDay=parts[2];
      }
    }

    const plan=installmentPlan({
      year,
      amount:annualAmount,
      frequency,
      firstDueMonth,
      dueDay,
    });
    const dueDate=plan[0]?.dueDate ?? null;

    const feeRows=await sql`
      INSERT INTO membership_fees (
        member_id,fiscal_year,amount,due_date,status,notes,
        fee_type_id,fee_type_name,payment_frequency,reference_text
      )
      VALUES (
        ${String(member.id)}::uuid,${year},${annualAmount},${dueDate}::date,
        ${fullyExempt ? "exempt" : "open"},
        ${fullyExempt ? String(member.exemption_reason || "Beitragsbefreiung") : null},
        ${member.fee_type_id || null}::uuid,
        ${member.fee_type_name || (member.custom_annual_amount!=null ? "Individuell" : "Standard")},
        ${frequency},
        ${member.reference_text || null}
      )
      RETURNING id::text
    `;

    const feeId=String(feeRows[0].id);
    if (!fullyExempt) {
      for (const installment of plan) {
        await sql`
          INSERT INTO membership_fee_installments (
            fee_id,installment_no,due_date,amount
          )
          VALUES (
            ${feeId}::uuid,${installment.installmentNo},
            ${installment.dueDate}::date,${installment.amount}
          )
        `;
      }
    }
    created++;
  }

  await writeAudit(actor.id,"finance.membership_fees_generated","membership_fee",null,{
    year,created,
  });
  revalidateFinance();
  redirect(`/finanzen/beitraege?fees=${created}`);
}

export async function recordMembershipFeePaymentAction(formData: FormData) {
  const actor=await requirePermission("finance.write");
  const sql=getDb();
  if (!sql) redirect("/finanzen/beitraege?error=database");

  const feeId=value(formData,"feeId");
  const amount=parseMoney(value(formData,"amount"));
  const paidOn=value(formData,"paidOn");
  const note=value(formData,"note");

  if (!feeId || !Number.isFinite(amount) || amount<=0 || !paidOn) {
    redirect("/finanzen/beitraege?error=invalid");
  }

  const feeRows=await sql`
    SELECT
      mf.id::text,mf.member_id::text,mf.fiscal_year,mf.amount,
      m.first_name,m.last_name,
      COALESCE((SELECT SUM(p.amount) FROM membership_fee_payments p WHERE p.fee_id=mf.id),0) AS paid
    FROM membership_fees mf
    JOIN members m ON m.id=mf.member_id
    WHERE mf.id=${feeId}::uuid
    LIMIT 1
  `;
  const fee=feeRows[0];
  if (!fee) redirect("/finanzen/beitraege?error=not_found");

  const remaining=Math.max(0,Number(fee.amount)-Number(fee.paid));
  if (amount>remaining+0.001) {
    redirect("/finanzen/beitraege?error=overpayment");
  }

  const entryRows=await sql`
    INSERT INTO finance_entries (
      entry_type,amount,category,description,booked_on,status,member_id
    )
    VALUES (
      'income',${amount},'Mitgliedsbeitrag',
      ${"Mitgliedsbeitrag "+String(fee.fiscal_year)+" – "+String(fee.first_name)+" "+String(fee.last_name)},
      ${paidOn}::date,'booked',${String(fee.member_id)}::uuid
    )
    RETURNING id::text
  `;
  const financeEntryId=String(entryRows[0].id);

  await sql`
    INSERT INTO membership_fee_payments (
      fee_id,finance_entry_id,amount,paid_on,note
    )
    VALUES (
      ${feeId}::uuid,${financeEntryId}::uuid,${amount},${paidOn}::date,${note || null}
    )
  `;

  const newPaid=Number(fee.paid)+amount;
  if (newPaid+0.001>=Number(fee.amount)) {
    await sql`
      UPDATE membership_fees
      SET status='paid',paid_on=${paidOn}::date
      WHERE id=${feeId}::uuid
    `;
  }

  await writeAudit(actor.id,"finance.membership_fee_payment","membership_fee",feeId,{
    amount,paidOn,financeEntryId,
  });
  revalidateFinance();
  revalidatePath(`/mitglieder/${String(fee.member_id)}`);
  redirect("/finanzen/beitraege?payment=1");
}

export async function updateMembershipFeeStatusAction(formData: FormData) {
  const actor=await requirePermission("finance.write");
  const sql=getDb();
  if (!sql) redirect("/finanzen/beitraege?error=database");

  const id=value(formData,"id");
  const status=value(formData,"status");
  const notes=value(formData,"notes");
  if (!id || !["open","paid","exempt","cancelled"].includes(status)) {
    redirect("/finanzen/beitraege?error=invalid");
  }

  await sql`
    UPDATE membership_fees
    SET
      status=${status},
      paid_on=CASE WHEN ${status}='paid' THEN COALESCE(paid_on,CURRENT_DATE) ELSE paid_on END,
      notes=COALESCE(${notes || null},notes)
    WHERE id=${id}::uuid
  `;

  await writeAudit(actor.id,"finance.membership_fee_status","membership_fee",id,{status});
  revalidateFinance();
  redirect("/finanzen/beitraege?status=1");
}
