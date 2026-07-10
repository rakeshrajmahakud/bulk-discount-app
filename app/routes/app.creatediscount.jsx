import { useState , useEffect } from "react";
import {useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server"; // this is the file that contains the shopify api key . It is used to authenticate the user 



// this is the file that contains the shopify api key . It is used to authenticate the user
// Verify that the request comes from an authenticated Shopify store.
// If the merchant is not logged in or the session is invalid,
// Shopify will automatically redirect them to authenticate.
export const loader = async ({ request }) => {
  await authenticate.admin(request); 
  return { ok : true }; 
}; 


// Verify the request and return an authenticated Admin API client.
// Use the `admin` object to make GraphQL or REST Admin API requests.
// Runs when this route receives a POST request (for example, from a form submission).
export const action = async ({ request }) => {
  // Use `admin` to interact with the Shopify Admin API.
  const { admin } = await authenticate.admin(request); 
  const formData = await request.formData();

  const title = formData.get("title");
  const discountType = formData.get("discountType");
  const value = Number(formData.get("value"));
  const numberOfCodes = formData.get("numberOfCodes");
  const codeLength = formData.get("codeLength");
  const startDate = formData.get("startDate");

  const discountValue =
  discountType === "percentage"
    ? { percentage: value / 100 }
    : {
        discountAmount: {
          amount: value.toFixed(2),
          appliesOnEachItem: false,
        },
      };


  function generateCode(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    return Array.from({ length }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  }

  //generate codes and put it in codes set untill the size of codes is equal to numberOfCodes , here we use set to remove duplicate codes
  const codes = new Set();
  while (codes.size < numberOfCodes) {
    codes.add(generateCode(codeLength));
  }

  const [firstCode, ...remainingCodes] = codes;

  const createRes = await admin.graphql(
    `#graphql
      mutation CreateDiscountUI($discount: DiscountCodeBasicInput!){
        discountCodeBasicCreate(basicCodeDiscount: $discount) {
          codeDiscountNode { id }
          userErrors { message }
        }
      }
    `,
    {
      variables: {
        discount: {
          title,
          startsAt: startDate,
          code: firstCode,
          customerGets: {
            value: discountValue,
            items:{ all : true }
          },
          customerSelection: { all: true},
        },
      }
    }
  );

  const createJson = await createRes.json();
  const discountId = createJson.data.discountCodeBasicCreate?.codeDiscountNode?.id;

  if(!discountId){
    return {
      error: "Discount creation failed",
      userErrors: createJson.data.discountCodeBasicCreate?.userErrors,
    }
  }

  for(const code of remainingCodes){
    await admin.graphql(
      `#graphql
        mutation addCode($id: ID!, $codes: [DiscountRedeemCodeInput!]!){
          discountRedeemCodeBulkAdd(discountId: $id, codes: $codes) {
            userErrors { message }
          }
        }
      `,
      {
        variables: {
          id: discountId,
          codes: [{ code }]
        }
      }
    )
  }

  return { success: true, codes: [...codes] };
};



// front end code
export default function CreateDiscountUI(){
  useLoaderData();

  const fetcher = useFetcher();

  const [title,setTitle] = useState("Bulk discount Offer");
  const [discountType, setDiscountType] = useState("percentage");
  const [value, setValue] = useState(10);
  const [numberOfCodes, setNumberOfCodes] = useState(5);
  const [codeLength, setCodeLength] = useState(8);

  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [codes, setCodes] = useState([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(()=>{
    if(!fetcher.data) return;

    if (fetcher.data.error){
      setError(fetcher.data.error);
      setToast("");
      setCodes([]);
    }
    else if (fetcher.data.success){
      setCodes(fetcher.data.codes); 
      setToast("Discount created successfully");
      setError("");
    }
  },[fetcher.data]);

  function submit(){
    setError("");
    setToast("");
    setCodes([]);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("discountType", discountType);
    formData.append("value", value.toString());
    formData.append("numberOfCodes", numberOfCodes.toString());
    formData.append("codeLength", codeLength.toString());
    formData.append("startDate", startDate);

    fetcher.submit(formData,{
      method: "POST",
      action: "/app/creatediscount"
    });

  }

  return(
    <s-page heading="Bulk discount code geenerator" padding="base">
      <s-section heading="Create Discount codes" padding="base">
        <s-card padding="base">
          <s-stack gap="base">
            <s-text-field padding="base" label="Title" value={title} onChange={(e)=>setTitle(e.target.value)}/>
            <s-select padding="base" label="Discount type" placeholder="Select discount type" value={discountType} onChange={(e)=>setDiscountType(e.target.value)}>
              <s-option value="percentage">Percentage</s-option>
              <s-option value="Fixed">Fix Amount</s-option>
            </s-select>

            <s-text-field padding="base" label="Discount value" type="number" value={value} onChange={(e)=>setValue(e.target.value)}/>
            <s-text-field padding="base" label="Number of codes" type="number" value={numberOfCodes} onChange={(e)=>setNumberOfCodes(Number(e.target.value))}/>
            <s-text-field padding="base" label="Code length" type="number" value={codeLength} onChange={(e)=>setCodeLength(Number(e.target.value))}/>
            <s-text-field padding="base" label="Start date" type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)}/>

            <s-button onClick={submit} padding="base" variant="primary" disabled={fetcher.state==="submitting"}>
              {fetcher.state === "submitting" ? "Creating..." : "Generate Discount Codes"}
            </s-button>
             
            {fetcher.state==="submitting" && <s-progress indeterminate padding="base"  />}
            {error && <s-banner tone="critical" padding="base">{error}</s-banner>}
            {toast && <s-banner tone="success" padding="base">{toast}</s-banner>}
          </s-stack> 
        </s-card>
      </s-section>

      {codes.length > 0 &&
        (
          <s-section heading="Discount codes" padding="base">
            <s-card padding="base">
              <s-unordered-list padding="base">
                {codes.map((code)=>(
                  <s-list-item key={code} padding="base">
                    <s-badge tone="neutral" icon="discount" key={code} padding="base" >{code}</s-badge>
                  </s-list-item>
                ))}
              </s-unordered-list>
            </s-card>
          </s-section>
        )
      }
    </s-page>
  ) 
}