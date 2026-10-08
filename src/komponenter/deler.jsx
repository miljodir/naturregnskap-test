/* Byggeklosser som brukes flere steder: komponentene fra designsystemet, celler i tabeller og linjer i tegnforklaringer. */
/* Hver komponent hentes fra sin egen fil. md-react er CommonJS, så hovedfilen drar med seg hele biblioteket. */
export { default as MdButton } from '@miljodirektoratet/md-react/dist/button/MdButton';
export { default as MdCheckbox } from '@miljodirektoratet/md-react/dist/formElements/MdCheckbox';
export { default as MdLink } from '@miljodirektoratet/md-react/dist/link/MdLink';
export { default as MdAccordionItem } from '@miljodirektoratet/md-react/dist/accordion/MdAccordionItem';

/* En celle i en tabell, med et mindre tall under hvis det er oppgitt. */
export const Celle = ({ type: T = 'td', tekst, under, ...resten }) => (
  <T {...resten}>
    {tekst}
    {under ? <small>{under}</small> : null}
  </T>
);
/* Fargeruten til et tema eller en klasse, med fargen som variabel. */
export const Rute = ({ id }) => <i style={{ '--c': `var(--${id})` }}></i>;
/* En linje i en tegnforklaring: fargerute og navn, tall til høyre, og en forklaring under hvis det er oppgitt. */
export const Fargelinje = ({ id, navn, tall, under, ekstra }) => (
  <li>
    <b>
      <Rute id={id} />
      {navn}
    </b>
    <span>{tall}</span>
    {under ? (
      <small>
        {under}
        {ekstra ? <b>{ekstra}</b> : null}
      </small>
    ) : null}
  </li>
);
